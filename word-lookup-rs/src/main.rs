use std::env;
use std::io::Read;
use std::net::TcpListener;
use std::process::ExitCode;
use std::time::Duration;

use word_lookup_rs::{HOST, PORT, first_source, load_sources, open_url, send_word, socket_addr};

fn open_lookup(word: &str) -> Result<(), String> {
    let sources = load_sources();
    let (source_name, template) = first_source(&sources)
        .ok_or_else(|| "No valid source in sources.json. Please add at least one.".to_string())?;

    let url = word_lookup_rs::build_lookup_url(template, word);
    open_url(&url).map_err(|err| format!("Failed to open URL for source '{source_name}': {err}"))
}

fn main() -> ExitCode {
    let arg_word = env::args()
        .skip(1)
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    let arg_word = if arg_word.is_empty() {
        None
    } else {
        Some(arg_word)
    };

    if let Some(word) = arg_word.as_deref() {
        if send_word(word, Duration::from_secs(1)) {
            return ExitCode::SUCCESS;
        }
    }

    // If daemon not running and there is an argument, handle it locally now.
    if let Some(word) = arg_word.as_deref() {
        if let Err(err) = open_lookup(word) {
            eprintln!("{err}");
        }
    }

    let sources = load_sources();
    let Some((source_name, _)) = first_source(&sources) else {
        eprintln!("No valid source in sources.json. Exiting.");
        return ExitCode::from(1);
    };

    let listener = match TcpListener::bind(socket_addr()) {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!("Socket already in use ({HOST}:{PORT}), server not started: {err}");
            return ExitCode::from(1);
        }
    };

    eprintln!("lookup_app listening on {HOST}:{PORT} (source: {source_name})");

    for incoming in listener.incoming() {
        let mut stream = match incoming {
            Ok(stream) => stream,
            Err(err) => {
                eprintln!("Accept failed: {err}");
                continue;
            }
        };

        let mut buffer = Vec::new();
        if let Err(err) = stream.read_to_end(&mut buffer) {
            eprintln!("Read failed: {err}");
            continue;
        }

        let word = String::from_utf8_lossy(&buffer).trim().to_string();
        if word.is_empty() {
            continue;
        }

        if let Err(err) = open_lookup(&word) {
            eprintln!("{err}");
        }
    }

    ExitCode::SUCCESS
}
