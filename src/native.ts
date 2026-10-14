type NativeWindow = Window & { __TAURI_INTERNALS__?: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } };
export function isDesktop() { return !!(window as NativeWindow).__TAURI_INTERNALS__; }
export async function sessionCredential(token?: string | null): Promise<string | null> {
  const native = (window as NativeWindow).__TAURI_INTERNALS__;
  if (!native) return null;
  if (token === undefined) return native.invoke<string | null>("read_session");
  await native.invoke("write_session", { token });
  return token;
}

let activeSurface: "auth" | "workspace" | null = null;
export async function setSurface(surface: "auth" | "workspace") {
  const native = (window as NativeWindow).__TAURI_INTERNALS__;
  if (native && activeSurface !== surface) {
    await native.invoke("set_surface", { surface });
    activeSurface = surface;
  }
}
export async function windowAction(action: "drag" | "minimize" | "close") {
  const native = (window as NativeWindow).__TAURI_INTERNALS__;
  if (native) await native.invoke("window_action", { action });
}

export async function showLaunch() {
  const native = (window as NativeWindow).__TAURI_INTERNALS__;
  if (native) await native.invoke("show_launch");
}
