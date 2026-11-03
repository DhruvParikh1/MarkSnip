package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/DhruvParikh1/markdownload-extension-updated/native/internal/bridge"
)

type clipRequest struct {
	Fresh bool `json:"fresh"`
}

type clipReply struct {
	Result *bridge.ClipResult `json:"result,omitempty"`
	Error  string             `json:"error,omitempty"`
}

type pendingResult struct {
	result *bridge.ClipResult
	err    string
}

type hostServer struct {
	browser bridge.Browser
	token   string
	writer  *bridge.NativeWriter
	pending sync.Map
	debugf  func(string, ...any)
}

func main() {
	log.SetOutput(io.Discard)
	debugf := buildDebugLogger()

	browser := bridge.DetectBrowserFromArgs(os.Args[1:])
	token, err := bridge.RandomToken()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer listener.Close()

	session := bridge.SessionStatus{
		Browser:     string(browser),
		Port:        listener.Addr().(*net.TCPAddr).Port,
		Token:       token,
		PID:         os.Getpid(),
		HostVersion: bridge.HostVersion,
		ConnectedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := bridge.WriteSession(session); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer func() {
		_ = bridge.RemoveSession(browser, os.Getpid())
	}()

	server := &hostServer{
		browser: browser,
		token:   token,
		writer:  bridge.NewNativeWriter(os.Stdout),
		debugf:  debugf,
	}
	debugf("host start browser=%s pid=%d", browser, os.Getpid())

	httpServer := &http.Server{
		Handler: server.routes(),
	}

	go func() {
		_ = httpServer.Serve(listener)
	}()

	_ = server.writer.Send(bridge.NativeMessage{
		Type:        "bridge.ready",
		Browser:     string(browser),
		HostVersion: bridge.HostVersion,
		ConnectedAt: session.ConnectedAt,
	})
	debugf("sent bridge.ready browser=%s", browser)

	for {
		message, err := bridge.ReadNativeMessage(os.Stdin)
		if err != nil {
			if !errors.Is(err, io.EOF) {
				fmt.Fprintln(os.Stderr, err)
			}
			debugf("stdin closed err=%v", err)
			break
		}
		debugf("native recv type=%s requestId=%s", message.Type, message.RequestID)

		switch message.Type {
		case "bridge.hello":
			_ = server.writer.Send(bridge.NativeMessage{
				Type:        "bridge.ready",
				Browser:     string(browser),
				HostVersion: bridge.HostVersion,
				ConnectedAt: session.ConnectedAt,
			})
			debugf("sent bridge.ready in response to hello")
		case "bridge.clip.result":
			if value, ok := server.pending.LoadAndDelete(message.RequestID); ok {
				reply := value.(chan pendingResult)
				reply <- pendingResult{result: message.Result}
				debugf("resolved clip result requestId=%s", message.RequestID)
			}
		case "bridge.error":
			if value, ok := server.pending.LoadAndDelete(message.RequestID); ok {
				reply := value.(chan pendingResult)
				reply <- pendingResult{err: message.Error}
				debugf("resolved clip error requestId=%s error=%s", message.RequestID, message.Error)
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}

func (s *hostServer) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/clip", s.handleClip)
	mux.HandleFunc("/status", s.handleStatus)
	return mux
}

func (s *hostServer) authenticate(w http.ResponseWriter, r *http.Request) bool {
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-MarkSnip-Token")), []byte(s.token)) != 1 {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		s.debugf("http unauthorized path=%s", r.URL.Path)
		return false
	}
	return true
}

func (s *hostServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"browser":     s.browser,
		"hostVersion": bridge.HostVersion,
		"connected":   true,
	})
}

func (s *hostServer) handleClip(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, clipReply{Error: "method not allowed"})
		return
	}

	var req clipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, clipReply{Error: "invalid request payload"})
		return
	}

	requestID, err := bridge.RandomToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, clipReply{Error: err.Error()})
		return
	}
	s.debugf("http clip request fresh=%v requestId=%s", req.Fresh, requestID)

	replyCh := make(chan pendingResult, 1)
	s.pending.Store(requestID, replyCh)
	defer s.pending.Delete(requestID)

	if err := s.writer.Send(bridge.NativeMessage{
		Type:      "bridge.clip",
		RequestID: requestID,
		Fresh:     req.Fresh,
	}); err != nil {
		s.debugf("native send failed requestId=%s err=%v", requestID, err)
		writeJSON(w, http.StatusBadGateway, clipReply{Error: err.Error()})
		return
	}
	s.debugf("native sent bridge.clip requestId=%s", requestID)

	select {
	case reply := <-replyCh:
		if reply.err != "" {
			s.debugf("http clip reply error requestId=%s err=%s", requestID, reply.err)
			writeJSON(w, http.StatusBadGateway, clipReply{Error: reply.err})
			return
		}
		s.debugf("http clip reply success requestId=%s", requestID)
		writeJSON(w, http.StatusOK, clipReply{Result: reply.result})
	case <-time.After(35 * time.Second):
		s.debugf("http clip timeout requestId=%s", requestID)
		writeJSON(w, http.StatusGatewayTimeout, clipReply{Error: "timed out waiting for MarkSnip bridge response"})
	}
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func buildDebugLogger() func(string, ...any) {
	if os.Getenv("MARKSNIP_BRIDGE_DEBUG") != "1" {
		return func(string, ...any) {}
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return func(string, ...any) {}
	}

	logDir := filepath.Join(configDir, "MarkSnip", "agent-bridge")
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		return func(string, ...any) {}
	}

	// The debug log can contain clipped page content, so keep it private.
	logPath := filepath.Join(logDir, "host-debug.log")
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return func(string, ...any) {}
	}

	return func(format string, args ...any) {
		line := fmt.Sprintf(format, args...)
		_, _ = fmt.Fprintf(file, "%s %s\n", time.Now().UTC().Format(time.RFC3339), line)
	}
}
