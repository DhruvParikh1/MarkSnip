package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthenticateRequiresTheExactToken(t *testing.T) {
	server := &hostServer{token: "expected-token", debugf: func(string, ...any) {}}

	cases := map[string]int{
		"expected-token":  http.StatusOK,
		"":                http.StatusUnauthorized,
		"expected-tokenX": http.StatusUnauthorized,
		"expected-toke":   http.StatusUnauthorized,
	}
	for token, want := range cases {
		request := httptest.NewRequest(http.MethodPost, "/clip", nil)
		if token != "" {
			request.Header.Set("X-MarkSnip-Token", token)
		}
		recorder := httptest.NewRecorder()
		if server.authenticate(recorder, request) {
			recorder.WriteHeader(http.StatusOK)
		}
		if recorder.Code != want {
			t.Errorf("token %q: status %d, want %d", token, recorder.Code, want)
		}
	}
}
