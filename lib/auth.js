/**
 * Password-auth failures, classified once for every surface.
 *
 * A password host looks exactly like a key-only host until `ssh` reports that the
 * server exhausted every authentication method it was offered. That report is a
 * stable OpenSSH message — `Permission denied (publickey,password)` — so the
 * offered methods, rather than a guess, decide whether the user is asked for a
 * password. The marker is appended to the message because the desktop error path
 * carries only a message across the RPC boundary; the UI and the tools strip it
 * again before anything is shown or handed to a model.
 *
 * @module dsh-ssh-remote/auth
 */

/** Trailing marker identifying an error the user resolves by entering a password. */
export const PASSWORD_REQUIRED = '[ssh-password-required]';

/**
 * Authentication methods the server offered, as OpenSSH reports them.
 * @param stderr - the failed `ssh` invocation's stderr.
 * @returns the method names, or an empty list when the failure was not an auth rejection.
 */
export function authMethods(stderr) {
  const match = /Permission denied \(([^)]*)\)/u.exec(String(stderr ?? ''));
  if (match === null) return [];
  return match[1].split(',').map((part) => part.trim()).filter((part) => part.length > 0);
}

/** True when the server accepts a password at all (password or keyboard-interactive). */
export function offersPassword(stderr) {
  const methods = authMethods(stderr);
  return methods.includes('password') || methods.includes('keyboard-interactive');
}

/**
 * The error raised when a host needs a password the user has not stored yet.
 * @param label - the destination, for the message.
 * @returns an error the UI turns into a password prompt.
 */
export function passwordRequiredError(label) {
  const error = new Error(`服务器 ${label} 需要密码认证。请在「密码」中填写密码并重试，密码会保存在本机，之后无需再次输入。 ${PASSWORD_REQUIRED}`);
  error.code = 'SSH_PASSWORD_REQUIRED';
  return error;
}

/**
 * The error raised when a stored password was not accepted.
 * @param label - the destination, for the message.
 * @param detail - the `ssh` diagnostic, when there is one.
 * @returns an error the UI turns into another password prompt.
 */
export function passwordRejectedError(label, detail) {
  const suffix = detail === undefined || detail.length === 0 ? '' : `（${detail}）`;
  const error = new Error(`服务器 ${label} 认证失败${suffix}。已保存的密码可能不正确，请重新输入或清除后改用密钥认证。 ${PASSWORD_REQUIRED}`);
  error.code = 'SSH_PASSWORD_REQUIRED';
  return error;
}

/**
 * Classify an authentication rejection against what this machine knows.
 * @param options - the destination label, whether a password is stored, and stderr.
 * @returns the error to report, or undefined when the failure is not an auth rejection.
 */
export function classifyAuthFailure({ label, hasPassword, stderr }) {
  const detail = String(stderr ?? '').trim();
  // A server that cannot accept a password leaves a stored one irrelevant, and a
  // failure that is not an authentication rejection has no remedy to offer here.
  if (authMethods(detail).length === 0 || !offersPassword(detail)) return undefined;
  return hasPassword ? passwordRejectedError(label, detail.slice(0, 400)) : passwordRequiredError(label);
}

/** True when a resolved error is one the user answers with a password. */
export function isPasswordRequired(value) {
  if (value?.code === 'SSH_PASSWORD_REQUIRED') return true;
  const message = value instanceof Error ? value.message : String(value ?? '');
  return message.includes(PASSWORD_REQUIRED);
}

/** Remove the marker so the message can be displayed or handed to a model. */
export function stripMarker(message) {
  return String(message ?? '').split(PASSWORD_REQUIRED).join('').trim();
}
