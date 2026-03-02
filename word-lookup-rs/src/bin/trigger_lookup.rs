use std::env;
use std::process::{Command, ExitCode};
use std::time::Duration;

use word_lookup_rs::{resolve_lookup_app_binary, send_word};

fn main() -> ExitCode {
    let word = env::args().skip(1).collect::<Vec<_>>().join(" ");
    let word = if word.trim().is_empty() {
        "hello".to_string()
    } else {
        word
    };

    if send_word(&word, Duration::from_secs(1)) {
        return ExitCode::SUCCESS;
    }

    let lookup_app = resolve_lookup_app_binary();
    match Command::new(&lookup_app).arg(&word).status() {
        Ok(status) => {
            if status.success() {
                ExitCode::SUCCESS
            } else {
                eprintln!(
                    "lookup_app exited with status {}",
                    status
                        .code()
                        .map_or_else(|| "unknown".to_string(), |code| code.to_string())
                );
                ExitCode::from(1)
            }
        }
        Err(err) => {
            eprintln!("Failed to launch {}: {err}", lookup_app.display());
            ExitCode::from(1)
        }
    }
}
