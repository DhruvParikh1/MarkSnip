package bridge

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

func TestNativeMessageRoundTrip(t *testing.T) {
	var buffer bytes.Buffer
	writer := NewNativeWriter(&buffer)
	if err := writer.Send(NativeMessage{Type: "bridge.clip", RequestID: "abc", Fresh: true}); err != nil {
		t.Fatalf("Send: %v", err)
	}

	message, err := ReadNativeMessage(&buffer)
	if err != nil {
		t.Fatalf("ReadNativeMessage: %v", err)
	}
	if message.Type != "bridge.clip" || message.RequestID != "abc" || !message.Fresh {
		t.Fatalf("unexpected message: %+v", message)
	}
}

func TestReadNativeMessageRejectsOversizedLengthBeforeAllocating(t *testing.T) {
	header := make([]byte, 4)
	binary.LittleEndian.PutUint32(header, MaxIncomingNativeMessageBytes+1)

	_, err := ReadNativeMessage(bytes.NewReader(header))
	if err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("expected an oversized-message error, got %v", err)
	}
}

func TestReadNativeMessageRejectsTruncatedPayload(t *testing.T) {
	header := make([]byte, 4)
	binary.LittleEndian.PutUint32(header, 10)

	if _, err := ReadNativeMessage(bytes.NewReader(append(header, []byte("{}")...))); err == nil {
		t.Fatal("expected an error for a payload shorter than its length prefix")
	}
}
