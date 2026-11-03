package bridge

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

func baseDir() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "MarkSnip", "agent-bridge"), nil
}

func StatusPath() (string, error) {
	dir, err := baseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "status.json"), nil
}

func EnsureStateBaseDir() (string, error) {
	dir, err := baseDir()
	if err != nil {
		return "", err
	}
	// status.json holds the bearer token for the loopback clip server, so the
	// directory and file are private to the current user.
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	// MkdirAll leaves an existing directory's mode alone; tighten older installs.
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func ReadStatusFile() (StatusFile, error) {
	path, err := StatusPath()
	if err != nil {
		return StatusFile{}, err
	}

	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return StatusFile{Sessions: map[string]SessionStatus{}}, nil
	}
	if err != nil {
		return StatusFile{}, err
	}

	var status StatusFile
	if err := json.Unmarshal(data, &status); err != nil {
		return StatusFile{}, err
	}
	if status.Sessions == nil {
		status.Sessions = map[string]SessionStatus{}
	}
	return status, nil
}

func WriteStatusFile(status StatusFile) error {
	if _, err := EnsureStateBaseDir(); err != nil {
		return err
	}

	if status.Sessions == nil {
		status.Sessions = map[string]SessionStatus{}
	}

	path, err := StatusPath()
	if err != nil {
		return err
	}

	payload, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return err
	}

	tempPath := path + ".tmp"
	// WriteFile only applies the mode when it creates the file, so start fresh.
	_ = os.Remove(tempPath)
	if err := os.WriteFile(tempPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return err
	}
	_ = os.Remove(path)
	return os.Rename(tempPath, path)
}

func WriteSession(session SessionStatus) error {
	status, err := ReadStatusFile()
	if err != nil {
		return err
	}
	if status.Sessions == nil {
		status.Sessions = map[string]SessionStatus{}
	}

	status.Sessions[session.Browser] = session
	return WriteStatusFile(status)
}

func RemoveSession(browser Browser, pid int) error {
	status, err := ReadStatusFile()
	if err != nil {
		return err
	}

	current, ok := status.Sessions[string(browser)]
	if !ok {
		return nil
	}
	if pid != 0 && current.PID != pid {
		return nil
	}

	delete(status.Sessions, string(browser))
	return WriteStatusFile(status)
}

func RandomToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func SelectSession(status StatusFile, requested Browser) (SessionStatus, error) {
	if len(status.Sessions) == 0 {
		return SessionStatus{}, errors.New("no MarkSnip bridge session is connected; open Chrome or Firefox with Agent Bridge enabled")
	}

	if requested != "" {
		session, ok := status.Sessions[string(requested)]
		if !ok {
			return SessionStatus{}, fmt.Errorf("no active MarkSnip bridge session for %s", requested)
		}
		return session, nil
	}

	if len(status.Sessions) > 1 {
		return SessionStatus{}, errors.New("multiple MarkSnip bridge sessions are connected; rerun with --browser chrome or --browser firefox")
	}

	for _, session := range status.Sessions {
		return session, nil
	}

	return SessionStatus{}, errors.New("no MarkSnip bridge session is connected")
}
