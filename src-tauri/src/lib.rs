use std::{
  env,
  ffi::OsString,
  net::{SocketAddr, TcpListener, TcpStream},
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_BODY_LIMIT: &str = "10485760";

struct BackendProcess(Option<Child>);

#[derive(Debug)]
struct NodeRuntime {
  program: OsString,
  source: String,
}

impl Drop for BackendProcess {
  fn drop(&mut self) {
    if let Some(child) = &mut self.0 {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

fn pick_port() -> Result<u16, String> {
  let listener = TcpListener::bind((DEFAULT_HOST, 0))
    .map_err(|err| format!("failed to reserve a loopback port: {err}"))?;
  listener
    .local_addr()
    .map(|addr| addr.port())
    .map_err(|err| format!("failed to inspect reserved loopback port: {err}"))
}

fn wait_for_server(port: u16) -> Result<(), String> {
  let addr: SocketAddr = format!("{DEFAULT_HOST}:{port}")
    .parse()
    .map_err(|err| format!("invalid backend address: {err}"))?;
  let deadline = Instant::now() + Duration::from_secs(20);

  while Instant::now() < deadline {
    if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(150));
  }

  Err(format!("Diamond backend did not accept connections on {addr} within 20s"))
}

fn bundled_backend_script(app: &tauri::App) -> Result<PathBuf, String> {
  if let Ok(script) = env::var("DIAMOND_SERVER_SCRIPT") {
    return Ok(PathBuf::from(script));
  }

  if cfg!(debug_assertions) {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    return manifest_dir
      .parent()
      .map(|root| root.join("build/index.js"))
      .ok_or_else(|| "failed to resolve repository root from src-tauri".to_string());
  }

  app
    .path()
    .resource_dir()
    .map(|dir| dir.join("backend/build/index.js"))
    .map_err(|err| format!("failed to resolve bundled resources: {err}"))
}

fn node_file_name() -> &'static str {
  if cfg!(windows) { "node.exe" } else { "node" }
}

fn is_node_sidecar_name(name: &str) -> bool {
  if cfg!(windows) {
    name.starts_with("node-") && name.ends_with(".exe")
  } else {
    name.starts_with("node-")
  }
}

fn push_node_candidates(candidates: &mut Vec<PathBuf>, dir: &Path) {
  candidates.push(dir.join(node_file_name()));

  if let Ok(entries) = std::fs::read_dir(dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if !path.is_file() {
        continue;
      }

      let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        continue;
      };

      if is_node_sidecar_name(name) {
        candidates.push(path);
      }
    }
  }
}

fn bundled_node_candidates(app: &tauri::App) -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  if let Ok(exe) = env::current_exe() {
    if let Some(dir) = exe.parent() {
      push_node_candidates(&mut candidates, &dir.join("binaries"));
      push_node_candidates(&mut candidates, dir);
    }
  }

  if let Ok(resource_dir) = app.path().resource_dir() {
    push_node_candidates(&mut candidates, &resource_dir.join("binaries"));
    push_node_candidates(&mut candidates, &resource_dir);
  }

  if cfg!(debug_assertions) {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    push_node_candidates(&mut candidates, &manifest_dir.join("binaries"));
  }

  candidates
}

fn node_runtime(app: &tauri::App) -> NodeRuntime {
  if let Ok(node) = env::var("DIAMOND_NODE_BIN") {
    return NodeRuntime {
      program: OsString::from(node),
      source: "DIAMOND_NODE_BIN".to_string(),
    };
  }

  for candidate in bundled_node_candidates(app) {
    if candidate.is_file() {
      return NodeRuntime {
        source: candidate.display().to_string(),
        program: candidate.into_os_string(),
      };
    }
  }

  NodeRuntime {
    program: OsString::from("node"),
    source: "PATH".to_string(),
  }
}

fn start_backend(app: &tauri::App) -> Result<(String, BackendProcess), String> {
  if let Ok(url) = env::var("DIAMOND_SERVER_URL") {
    return Ok((url, BackendProcess(None)));
  }

  let port = env::var("DIAMOND_DESKTOP_PORT")
    .ok()
    .and_then(|raw| raw.parse::<u16>().ok())
    .map_or_else(pick_port, Ok)?;
  let url = format!("http://{DEFAULT_HOST}:{port}");
  let script = bundled_backend_script(app)?;

  if !script.is_file() {
    return Err(format!(
      "missing backend script at {}. Run `npm run build` before starting the desktop shell.",
      script.display()
    ));
  }

  let node = node_runtime(app);
  let cwd = if cfg!(debug_assertions) {
    script
      .parent()
      .and_then(|build_dir| build_dir.parent())
      .map(PathBuf::from)
      .ok_or_else(|| {
        format!(
          "failed to resolve backend working directory for {}",
          script.display()
        )
      })?
  } else {
    app.path()
      .resource_dir()
      .map_err(|err| format!("failed to resolve packaged backend working directory: {err}"))?
  };

  eprintln!("[diamond-desktop] using Node runtime from {}", node.source);

  let child = Command::new(&node.program)
    .arg(&script)
    .current_dir(cwd)
    .env("HOST", DEFAULT_HOST)
    .env("PORT", port.to_string())
    .env("BODY_SIZE_LIMIT", DEFAULT_BODY_LIMIT)
    .env("ORIGIN", &url)
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
    .map_err(|err| format!("failed to start Diamond backend: {err}"))?;

  wait_for_server(port)?;
  Ok((url, BackendProcess(Some(child))))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let (backend_url, backend) = start_backend(app)?;
      app.manage(Mutex::new(backend));

      let window_url = backend_url
        .parse()
        .map_err(|err| format!("invalid Diamond backend URL {backend_url}: {err}"))?;

      WebviewWindowBuilder::new(app, "main", WebviewUrl::External(window_url))
        .title("Diamond Markdown")
        .inner_size(1200.0, 800.0)
        .min_inner_size(900.0, 620.0)
        .resizable(true)
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Diamond Markdown desktop shell");
}
