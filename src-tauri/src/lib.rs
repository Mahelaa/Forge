use std::sync::Mutex;
struct CredentialLock(Mutex<()>);
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.forge.app", "refresh-session").map_err(|e| e.to_string())
}
#[tauri::command]
fn read_session(state: tauri::State<CredentialLock>) -> Result<Option<String>, String> {
    let _guard = state.0.lock().map_err(|e| e.to_string())?;
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
#[tauri::command]
fn write_session(token: Option<String>, state: tauri::State<CredentialLock>) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|e| e.to_string())?;
    let credential = entry()?;
    match token {
        Some(value) => credential.set_password(&value).map_err(|e| e.to_string()),
        None => match credential.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}
#[tauri::command]
fn show_launch(window: tauri::WebviewWindow) -> Result<(), String> {
    window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0))).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())
}
#[tauri::command]
fn set_surface(window: tauri::WebviewWindow, surface: &str) -> Result<(), String> {
    let (width, height) = match surface {
        "auth" => (520.0, 740.0),
        "workspace" => (1000.0, 760.0),
        _ => return Err("Unknown Forge surface".into()),
    };
    window.set_min_size(Some(tauri::LogicalSize::new(360.0, 300.0))).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    window.set_resizable(surface == "workspace").map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn window_action(window: tauri::WebviewWindow, action: &str) -> Result<(), String> {
    match action {
        "drag" => window.start_dragging(),
        "minimize" => window.minimize(),
        "close" => window.close(),
        _ => return Err("Unknown window action".into()),
    }.map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CredentialLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![read_session, write_session, set_surface, window_action, show_launch])
        .run(tauri::generate_context!())
        .expect("error while running Forge");
}
