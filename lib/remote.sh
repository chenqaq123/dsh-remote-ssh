# dsh-remote.sh — one-shot remote filesystem helper for the DSH SSH remote backend.
#
# Invoked as:
#   ssh <opts> <host> -- sh -c '<this script>' dsh-remote <op> <octal-encoded-arg>...
#
# Every argument after the operation name is an octal escape string decoded with
# `printf %b`. Encoding on the client side removes ALL quoting and word-splitting
# hazards: an encoded token only ever contains backslashes and octal digits.
#
# stdin  : payload bytes (write op only)
# stdout : result bytes, always prefixed by one machine-readable header line
# stderr : human diagnostics
#
# Exit codes (the client maps these onto the ctx.fs error taxonomy):
#   0  success
#   41 not found              -> FS_NOT_FOUND
#   42 not a directory        -> FS_NOT_DIRECTORY
#   43 permission denied      -> FS_PERMISSION_DENIED
#   44 not a regular file     -> FS_NOT_REGULAR_FILE
#   45 too large              -> FS_TOO_LARGE
#   48 stale version          -> FS_STALE_VERSION
#   49 io error               -> FS_IO_ERROR
#   50 not observed           -> FS_NOT_OBSERVED
#
# Requires only POSIX sh plus stat/printf/cat/mv/mkdir/chmod/dirname. Bash is not
# required, and no state is kept between invocations.

set -u
# Byte-oriented string handling: ${#name} must count bytes, not characters, so
# the name-length framing below stays correct for multibyte file names.
LC_ALL=C
export LC_ALL

decode() { printf '%b' "$1"; }

op=$1
shift

# --- capability probes -------------------------------------------------------
if stat -c '%d' / >/dev/null 2>&1; then
	DSH_GNU_STAT=1
else
	DSH_GNU_STAT=0
fi

# --- metadata probe ----------------------------------------------------------
# probe_fields <path> <follow 0|1>
# On success sets PF_TYPE (d|f|l|o), PF_SIZE, PF_MODE, PF_VERSION and returns 0.
# Returns 1 when the path is absent or its metadata is unreadable.
#
# The version deliberately includes the inode: every publication performed by the
# write op goes through rename(2), so a completed write always changes the inode
# even when size and whole-second timestamps are unchanged. That keeps the
# version-guard meaningful without paying for sub-second stat precision.
#
# Only numeric stat fields are used. The human-readable type field is avoided on
# purpose: BSD stat renders it as "Regular File", whose embedded space would break
# the single-token framing this protocol relies on. The entry type comes from the
# shell's own tests instead, which cost no extra process.
probe_fields() {
	pf_path=$1
	pf_follow=${2:-0}
	if [ ! -e "$pf_path" ] && [ ! -L "$pf_path" ]; then
		return 1
	fi
	if [ "$pf_follow" = 1 ]; then
		if [ -d "$pf_path" ]; then PF_TYPE=d
		elif [ -f "$pf_path" ]; then PF_TYPE=f
		else PF_TYPE=o
		fi
	else
		if [ -L "$pf_path" ]; then PF_TYPE=l
		elif [ -d "$pf_path" ]; then PF_TYPE=d
		elif [ -f "$pf_path" ]; then PF_TYPE=f
		else PF_TYPE=o
		fi
	fi
	if [ "$DSH_GNU_STAT" = 1 ]; then
		if [ "$pf_follow" = 1 ]; then
			pf_line=$(stat -L -c '%d %i %s %a %Y %Z' "$pf_path" 2>/dev/null) || return 1
		else
			pf_line=$(stat -c '%d %i %s %a %Y %Z' "$pf_path" 2>/dev/null) || return 1
		fi
	else
		if [ "$pf_follow" = 1 ]; then
			pf_line=$(stat -L -f '%d %i %z %Lp %m %c' "$pf_path" 2>/dev/null) || return 1
		else
			pf_line=$(stat -f '%d %i %z %Lp %m %c' "$pf_path" 2>/dev/null) || return 1
		fi
	fi
	# Word splitting is intended: the format emits exactly six numeric fields and
	# none of them can contain whitespace.
	# shellcheck disable=SC2086
	set -- $pf_line
	[ $# -ge 6 ] || return 1
	PF_SIZE=$3
	PF_MODE=$4
	PF_VERSION=$1:$2:$3:$5:$6
	return 0
}

# --- operations --------------------------------------------------------------
case "$op" in
browse)
	dir=$(decode "$1"; printf '.')
	dir=${dir%.}
	hidden=$(decode "$2"; printf '.')
	hidden=${hidden%.}
	[ -n "$dir" ] || dir=$HOME
	[ -d "$dir" ] || exit 42
	[ -r "$dir" ] && [ -x "$dir" ] || exit 43
	CDPATH= cd -P "$dir" 2>/dev/null || exit 43
	dir=$(pwd -P; printf '.')
	dir=${dir%?}; dir=${dir%?}
	printf '#B %s\n%s\n' "${#dir}" "$dir"
	count=0; truncated=0
	for f in ./* ./.[!.]* ./..?*; do
		[ -d "$f" ] || continue
		name=${f#./}
		case "$name" in .*) [ "$hidden" = 1 ] || continue ;; esac
		if [ "$count" -ge 500 ]; then truncated=1; break; fi
		printf 'T d 0 - %s\n%s\n' "${#name}" "$name"
		count=$((count + 1))
	done
	printf '#E %s\n' "$truncated"
	;;
hello)
	printf '#H host=%s kernel=%s gnu_stat=%s\n' "$(hostname 2>/dev/null || echo unknown)" "$(uname -s 2>/dev/null || echo unknown)" "$DSH_GNU_STAT"
	;;

stat | lstat)
	p=$(decode "$1"; printf '.')
	p=${p%.}
	[ "$op" = stat ] && follow=1 || follow=0
	if probe_fields "$p" "$follow"; then
		printf '#S %s %s %s\n' "$PF_TYPE" "$PF_SIZE" "$PF_VERSION"
	else
		printf '#S absent\n'
	fi
	;;

# read <path> [maxBytes|-1]
# Header: "#V <version> <size> <type>" followed by the raw file bytes.
read)
	p=$(decode "$1"; printf '.')
	p=${p%.}
	cap=$(decode "$2"; printf '.')
	cap=${cap%.}
	if ! probe_fields "$p" 1; then exit 41; fi
	[ "$PF_TYPE" = f ] || exit 44
	if [ "$cap" != "-1" ] && [ "$PF_SIZE" -gt "$cap" ]; then exit 45; fi
	printf '#V %s %s %s\n' "$PF_VERSION" "$PF_SIZE" "$PF_TYPE"
	cat "$p" || exit 49
	;;

# readrange <path> <offset> <length>
# Header "#V <version> <size> <type>" then exactly the requested window.
readrange)
	p=$(decode "$1"; printf '.')
	p=${p%.}
	off=$(decode "$2"; printf '.')
	off=${off%.}
	len=$(decode "$3"; printf '.')
	len=${len%.}
	if ! probe_fields "$p" 1; then exit 41; fi
	[ "$PF_TYPE" = f ] || exit 44
	printf '#V %s %s %s\n' "$PF_VERSION" "$PF_SIZE" "$PF_TYPE"
	tail -c "+$((off + 1))" "$p" 2>/dev/null | head -c "$len" || exit 49
	;;

# list <dir>
# Header "#L", then one record per entry, binary-safe: a record header line
#   "T <type> <size> <version> <nameBytes>"
# followed by exactly <nameBytes> raw name bytes and one newline.
list)
	dir=$(decode "$1"; printf '.')
	dir=${dir%.}
	if [ ! -d "$dir" ]; then
		if [ -e "$dir" ]; then exit 42; else exit 41; fi
	fi
	printf '#L\n'
	for f in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do
		# An unmatched glob survives literally; skip it.
		if [ ! -e "$f" ] && [ ! -L "$f" ]; then continue; fi
		if probe_fields "$f" 0; then
			name=${f##*/}
			printf 'T %s %s %s %s\n' "$PF_TYPE" "$PF_SIZE" "$PF_VERSION" "${#name}"
			printf '%s\n' "$name"
		fi
	done
	;;

# write <path> <mode|-> <expectedVersion|-> <any|must-exist|must-absent> <diffCap|-1>
# New content arrives on stdin. Publishes atomically through a sibling temp file
# and rename(2). Header: "#W <existed 0|1> <version> <type> <oldBytes>" followed
# by the previous content when it was captured for the diff basis.
write)
	target=$(decode "$1"; printf '.')
	target=${target%.}
	mode=$(decode "$2"; printf '.')
	mode=${mode%.}
	expected=$(decode "$3"; printf '.')
	expected=${expected%.}
	policy=$(decode "$4"; printf '.')
	policy=${policy%.}
	cap=$(decode "$5"; printf '.')
	cap=${cap%.}

	target_dir=$(dirname "$target")
	mkdir -p "$target_dir" 2>/dev/null || exit 43

	if probe_fields "$target" 0; then
		existed=1
		cur_version=$PF_VERSION
		cur_type=$PF_TYPE
		cur_size=$PF_SIZE
		cur_mode=$PF_MODE
	else
		existed=0
		cur_version=-
		cur_type=o
		cur_size=0
		cur_mode=-
	fi
	if [ "$existed" = 1 ] && [ "$cur_type" = d ]; then exit 44; fi

	case "$policy" in
	must-exist)
		[ "$existed" = 1 ] || exit 48
		;;
	must-absent)
		[ "$existed" = 0 ] || exit 50
		;;
	esac
	if [ "$expected" != "-" ] && [ "$expected" != "$cur_version" ]; then exit 48; fi

	old_bytes=0
	new_tmp=
	old_tmp=
	trap 'rm -f -- "$new_tmp" "$old_tmp"' 0
	trap 'exit 49' 1 2 15
	old_tmp=
	if [ "$existed" = 1 ] && [ "$cur_type" = f ] && [ "$cap" != "-1" ] && [ "$cur_size" -lt "$cap" ]; then
		old_tmp=$(mktemp "$target_dir/.dsh-old-XXXXXX") || exit 43
		if cp "$target" "$old_tmp" 2>/dev/null; then
			old_bytes=$cur_size
		else
			old_bytes=0
		fi
	fi

	new_tmp=$(mktemp "$target_dir/.dsh-new-XXXXXX") || exit 43
	if ! cat >"$new_tmp"; then
		rm -f "$new_tmp"
		exit 49
	fi

	if [ "$mode" = "-" ]; then mode=$cur_mode; fi
	if [ "$mode" != "-" ]; then chmod "$mode" "$new_tmp" 2>/dev/null || true; fi
	if ! mv -f "$new_tmp" "$target"; then
		rm -f "$new_tmp"
		exit 49
	fi

	if probe_fields "$target" 0; then
		new_version=$PF_VERSION
		new_type=$PF_TYPE
	else
		new_version=missing
		new_type=o
	fi

	printf '#W %s %s %s %s\n' "$existed" "$new_version" "$new_type" "$old_bytes"
	if [ "$old_bytes" -gt 0 ]; then
		cat "$old_tmp" || true
	fi
	if [ -n "$old_tmp" ]; then rm -f "$old_tmp"; fi
	;;

*)
	printf 'dsh-remote: unknown operation: %s\n' "$op" >&2
	exit 49
	;;
esac

exit 0
