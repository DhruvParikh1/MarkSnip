package bridge

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func useTempConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("AppData", dir)
	return dir
}

func TestWriteStatusFileIsPrivateToTheUser(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits do not apply on Windows")
	}
	useTempConfigDir(t)

	// An older install left the directory world-readable.
	dir, err := baseDir()
	if err != nil {
		t.Fatalf("baseDir: %v", err)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	if err := WriteSession(SessionStatus{Browser: "chrome", Port: 4100, Token: "secret"}); err != nil {
		t.Fatalf("WriteSession: %v", err)
	}

	path, err := StatusPath()
	if err != nil {
		t.Fatalf("StatusPath: %v", err)
	}
	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat status file: %v", err)
	}
	if mode := fileInfo.Mode().Perm(); mode != 0o600 {
		t.Fatalf("status.json mode = %o, want 600", mode)
	}
	dirInfo, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatalf("Stat status dir: %v", err)
	}
	if mode := dirInfo.Mode().Perm(); mode != 0o700 {
		t.Fatalf("status dir mode = %o, want 700", mode)
	}

	status, err := ReadStatusFile()
	if err != nil {
		t.Fatalf("ReadStatusFile: %v", err)
	}
	if status.Sessions["chrome"].Token != "secret" {
		t.Fatalf("session not persisted: %+v", status.Sessions)
	}
}
