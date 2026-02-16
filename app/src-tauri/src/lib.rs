use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Image, Manager, State};

fn make_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let dashboard = MenuItem::with_id(app, "dashboard", "Open Dashboard", true, None)?;
    let quit = MenuItem::with_id(app, "quit", "Quit CSM", true, None)?;
    let menu = Menu::with_items(app, &[&dashboard, &quit])?;
    Ok(menu)
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = make_tray_menu(app)?;

    let icon_path = app
        .path()
        .resource_dir()
        .map(|p| p.join("icons").join("32x32.png"))
        .or_else(|| {
            std::env::var("CARGO_MANIFEST_DIR").ok().map(|s| {
                std::path::PathBuf::from(s).join("icons").join("32x32.png")
            })
        });

    let icon = match icon_path.as_ref().filter(|p| p.exists()) {
        Some(p) => Image::from_path(p)?,
        None => Image::from_bytes(include_bytes!("../icons/32x32.png"))?,
    };

    let tray = TrayIconBuilder::new()
        .menu(&menu)
        .icon(icon)
        .tooltip("CSM — Claude Session Manager")
        .menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            if event.id.as_ref() == "dashboard" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            } else if event.id.as_ref() == "quit" {
                app.exit(0);
            }
        })
        .build(app)?;

    app.manage(tray);
    Ok(())
}

#[tauri::command]
fn set_tray_tooltip(
    tray: State<'_, TrayIcon<tauri::Wry>>,
    tooltip: Option<String>,
) -> Result<(), String> {
    tray.set_tooltip(tooltip.as_deref()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![set_tray_tooltip])
        .setup(|app| {
            #[cfg(desktop)]
            {
                setup_tray(app)?;
                // 창이 뜨도록 표시 + 포커스 (트레이만 있으면 창이 가려질 수 있음)
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
