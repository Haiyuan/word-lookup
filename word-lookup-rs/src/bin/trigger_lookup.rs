use std::env;
use std::process::{Command, ExitCode, Stdio};
use std::thread;
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
    let spawn_result = Command::new(&lookup_app)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Err(err) = spawn_result {
        eprintln!("Failed to launch {}: {err}", lookup_app.display());
        return ExitCode::from(1);
    }

    // Wait briefly for daemon socket to bind, then retry delivery.
    for _ in 0..8 {
        thread::sleep(Duration::from_millis(200));
        if send_word(&word, Duration::from_millis(800)) {
            return ExitCode::SUCCESS;
        }
    }

    eprintln!("Failed to send lookup word after launching lookup_app.");
    ExitCode::from(1)
}
