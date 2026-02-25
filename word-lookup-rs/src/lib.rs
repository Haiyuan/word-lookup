use std::env;
use std::fmt::Write as _;
use std::fs;
use std::io::{self, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

pub const HOST: &str = "127.0.0.1";
pub const PORT: u16 = 5050;
const APP_NAME: &str = "word-lookup";

pub type Sources = Vec<(String, String)>;

pub fn socket_addr() -> SocketAddr {
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), PORT)
}

pub fn get_app_support_dir(app_name: &str) -> PathBuf {
    if cfg!(target_os = "macos") {
        return home_dir()
            .join("Library")
            .join("Application Support")
            .join(app_name);
    }

    if cfg!(target_os = "windows") {
        if let Ok(appdata) = env::var("APPDATA") {
            return PathBuf::from(appdata).join(app_name);
        }
        return home_dir().join("AppData").join("Roaming").join(app_name);
    }

    if let Ok(xdg) = env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg).join(app_name);
    }

    home_dir().join(".local").join("share").join(app_name)
}

pub fn load_sources() -> Sources {
    let defaults = default_sources();
    let path = sources_file_path();

    if let Some(parent) = path.parent() {
        if let Err(err) = fs::create_dir_all(parent) {
            eprintln!(
                "Failed to create app support dir {}: {err}",
                parent.display()
            );
            return defaults;
        }
    }

    if let Ok(content) = fs::read_to_string(&path) {
        match parse_sources_json(&content) {
            Ok(parsed) if !parsed.is_empty() => return parsed,
            Ok(_) => eprintln!("sources.json is empty; using defaults."),
            Err(err) => eprintln!("Failed to parse {}: {err}", path.display()),
        }
    }

    if let Err(err) = save_sources(&path, &defaults) {
        eprintln!(
            "Failed to save default sources to {}: {err}",
            path.display()
        );
    }
    defaults
}

pub fn first_source(sources: &Sources) -> Option<(&str, &str)> {
    sources
        .first()
        .map(|(name, template)| (name.as_str(), template.as_str()))
}

pub fn build_lookup_url(template: &str, word: &str) -> String {
    let encoded = percent_encode(word);
    if template.contains("{word}") {
        template.replace("{word}", &encoded)
    } else if template.contains("%s") {
        template.replace("%s", &encoded)
    } else {
        format!("{template}{encoded}")
    }
}

pub fn send_word(word: &str, timeout: Duration) -> bool {
    if word.trim().is_empty() {
        return false;
    }

    match TcpStream::connect_timeout(&socket_addr(), timeout) {
        Ok(mut stream) => stream.write_all(word.as_bytes()).is_ok(),
        Err(_) => false,
    }
}

pub fn open_url(url: &str) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(url);
        c
    };

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").arg("start").arg("").arg(url);
        c
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };

    let status = cmd.status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "open command failed for URL: {url}"
        )))
    }
}

pub fn resolve_lookup_app_binary() -> PathBuf {
    if let Ok(path) = env::var("LOOKUP_APP_PATH") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return candidate;
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            let filename = if cfg!(windows) {
                "lookup_app.exe"
            } else {
                "lookup_app"
            };
            let candidate = dir.join(filename);
            if candidate.exists() {
                return candidate;
            }
        }
    }

    if cfg!(windows) {
        PathBuf::from("lookup_app.exe")
    } else {
        PathBuf::from("lookup_app")
    }
}

fn home_dir() -> PathBuf {
    if cfg!(windows) {
        return env::var("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
    }

    env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn sources_file_path() -> PathBuf {
    get_app_support_dir(APP_NAME).join("sources.json")
}

fn default_sources() -> Sources {
    vec![
        (
            "StarDict".to_string(),
            "https://192.168.1.4:8443/dict.html?q={word}".to_string(),
        ),
        (
            "Youdao".to_string(),
            "https://www.youdao.com/w/eng/{word}/".to_string(),
        ),
        (
            "Wiktionary".to_string(),
            "https://en.wiktionary.org/wiki/{word}".to_string(),
        ),
        (
            "Google Define".to_string(),
            "https://www.google.com/search?q=define+{word}".to_string(),
        ),
    ]
}

fn save_sources(path: &Path, sources: &Sources) -> io::Result<()> {
    let mut output = String::new();
    output.push_str("{\n");

    for (index, (name, template)) in sources.iter().enumerate() {
        output.push_str("  \"");
        output.push_str(&escape_json_string(name));
        output.push_str("\": \"");
        output.push_str(&escape_json_string(template));
        output.push('"');
        if index + 1 != sources.len() {
            output.push(',');
        }
        output.push('\n');
    }

    output.push_str("}\n");
    fs::write(path, output)
}

fn escape_json_string(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0c}' => escaped.push_str("\\f"),
            c if c.is_control() => {
                let _ = write!(&mut escaped, "\\u{:04X}", c as u32);
            }
            c => escaped.push(c),
        }
    }
    escaped
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                let _ = write!(&mut encoded, "%{byte:02X}");
            }
        }
    }
    encoded
}

fn parse_sources_json(input: &str) -> io::Result<Sources> {
    let mut parser = JsonParser::new(input);
    parser.skip_ws();
    parser.expect_char('{')?;

    let mut sources = Vec::new();
    loop {
        parser.skip_ws();
        if parser.consume_char('}') {
            break;
        }

        let key = parser.parse_string()?;
        parser.skip_ws();
        parser.expect_char(':')?;
        parser.skip_ws();
        let value = parser.parse_string()?;

        if !key.trim().is_empty() && !value.trim().is_empty() {
            sources.push((key, value));
        }

        parser.skip_ws();
        if parser.consume_char(',') {
            continue;
        }
        parser.expect_char('}')?;
        break;
    }

    parser.skip_ws();
    if !parser.is_eof() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Trailing content after JSON object",
        ));
    }

    Ok(sources)
}

struct JsonParser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> JsonParser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, pos: 0 }
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek_char(), Some(ch) if ch.is_whitespace()) {
            let _ = self.next_char();
        }
    }

    fn parse_string(&mut self) -> io::Result<String> {
        self.expect_char('"')?;
        let mut result = String::new();

        loop {
            let ch = self.next_char().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidData, "Unterminated JSON string")
            })?;

            match ch {
                '"' => break,
                '\\' => {
                    let escaped = self.next_char().ok_or_else(|| {
                        io::Error::new(io::ErrorKind::InvalidData, "Incomplete escape sequence")
                    })?;
                    match escaped {
                        '"' => result.push('"'),
                        '\\' => result.push('\\'),
                        '/' => result.push('/'),
                        'b' => result.push('\u{0008}'),
                        'f' => result.push('\u{000c}'),
                        'n' => result.push('\n'),
                        'r' => result.push('\r'),
                        't' => result.push('\t'),
                        'u' => {
                            let mut value = 0u32;
                            for _ in 0..4 {
                                let hex = self.next_char().ok_or_else(|| {
                                    io::Error::new(
                                        io::ErrorKind::InvalidData,
                                        "Incomplete unicode escape",
                                    )
                                })?;
                                let digit = hex.to_digit(16).ok_or_else(|| {
                                    io::Error::new(
                                        io::ErrorKind::InvalidData,
                                        "Invalid unicode escape digits",
                                    )
                                })?;
                                value = (value << 4) | digit;
                            }
                            let unicode = char::from_u32(value).ok_or_else(|| {
                                io::Error::new(
                                    io::ErrorKind::InvalidData,
                                    "Invalid unicode scalar in escape",
                                )
                            })?;
                            result.push(unicode);
                        }
                        _ => {
                            return Err(io::Error::new(
                                io::ErrorKind::InvalidData,
                                "Unsupported JSON escape sequence",
                            ));
                        }
                    }
                }
                c => result.push(c),
            }
        }

        Ok(result)
    }

    fn expect_char(&mut self, expected: char) -> io::Result<()> {
        match self.next_char() {
            Some(ch) if ch == expected => Ok(()),
            Some(ch) => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Expected '{expected}', got '{ch}'"),
            )),
            None => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Expected '{expected}', but reached EOF"),
            )),
        }
    }

    fn consume_char(&mut self, expected: char) -> bool {
        if self.peek_char() == Some(expected) {
            let _ = self.next_char();
            true
        } else {
            false
        }
    }

    fn peek_char(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn next_char(&mut self) -> Option<char> {
        let ch = self.peek_char()?;
        self.pos += ch.len_utf8();
        Some(ch)
    }
}
