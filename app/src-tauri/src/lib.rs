//! Watson : l'interface (web) et le moteur (Python, embarqué comme programme compagnon).
//!
//! Au démarrage, l'application lance le moteur, lit sa première ligne « WATSON {port, jeton} » et la donne à
//! l'interface, qui l'appelle ensuite en HTTP sur 127.0.0.1. Le moteur est arrêté à la fermeture.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

#[derive(Clone, Serialize, Default)]
struct Moteur {
    port: u16,
    jeton: String,
    version: String,
    erreur: Option<String>,
}

#[derive(Default)]
struct Etat {
    moteur: Mutex<Option<Moteur>>,
    enfant: Mutex<Option<CommandChild>>,
    /// Dernières lignes d'erreur du moteur, affichées si le moteur s'arrête.
    journal: Mutex<Vec<String>>,
}

#[tauri::command]
fn moteur(etat: tauri::State<Etat>) -> Option<Moteur> {
    etat.moteur.lock().unwrap().clone()
}

fn demarrer_moteur(app: &tauri::AppHandle) {
    let commande = match app.shell().sidecar("watson-moteur") {
        Ok(c) => c,
        Err(e) => {
            *app.state::<Etat>().moteur.lock().unwrap() = Some(Moteur { erreur: Some(e.to_string()), ..Default::default() });
            return;
        }
    };
    match commande.spawn() {
        Ok((mut rx, enfant)) => {
            *app.state::<Etat>().enfant.lock().unwrap() = Some(enfant);
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(evenement) = rx.recv().await {
                    match evenement {
                        CommandEvent::Stdout(ligne) => {
                            let texte = String::from_utf8_lossy(&ligne);
                            if let Some(json) = texte.trim().strip_prefix("WATSON ") {
                                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
                                    let m = Moteur {
                                        port: v["port"].as_u64().unwrap_or(0) as u16,
                                        jeton: v["jeton"].as_str().unwrap_or_default().to_string(),
                                        version: v["version"].as_str().unwrap_or_default().to_string(),
                                        erreur: None,
                                    };
                                    *app.state::<Etat>().moteur.lock().unwrap() = Some(m);
                                }
                            }
                        }
                        CommandEvent::Stderr(ligne) => {
                            let texte = String::from_utf8_lossy(&ligne).trim_end().to_string();
                            eprintln!("[moteur] {}", texte);
                            let etat = app.state::<Etat>();
                            let mut journal = etat.journal.lock().unwrap();
                            journal.push(texte);
                            let surplus = journal.len().saturating_sub(15);
                            journal.drain(..surplus);
                        }
                        CommandEvent::Terminated(fin) => {
                            let detail = app.state::<Etat>().journal.lock().unwrap().join("\n");
                            let code = fin.code.map(|c| c.to_string()).unwrap_or_else(|| "inconnu".into());
                            let message = format!("Le moteur s'est arrêté (code {}).\n{}", code, detail);
                            *app.state::<Etat>().moteur.lock().unwrap() = Some(Moteur { erreur: Some(message), ..Default::default() });
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => {
            *app.state::<Etat>().moteur.lock().unwrap() = Some(Moteur { erreur: Some(e.to_string()), ..Default::default() });
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Etat::default())
        .setup(|app| {
            demarrer_moteur(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![moteur])
        .build(tauri::generate_context!())
        .expect("impossible de démarrer Watson");
    app.run(|app, evenement| {
        if let RunEvent::Exit = evenement {
            if let Some(enfant) = app.state::<Etat>().enfant.lock().unwrap().take() {
                let _ = enfant.kill();
            }
        }
    });
}
