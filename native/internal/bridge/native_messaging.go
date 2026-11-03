package bridge

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

// MaxIncomingNativeMessageBytes caps a message from the browser before its
// buffer is allocated. Clip responses carry a page's Markdown, so this is far
// above any real message but stops a bad length prefix from allocating up to 4 GiB.
const MaxIncomingNativeMessageBytes = 64 << 20

type NativeWriter struct {
	target io.Writer
	mu     sync.Mutex
}

func NewNativeWriter(target io.Writer) *NativeWriter {
	return &NativeWriter{target: target}
}

func (w *NativeWriter) Send(message NativeMessage) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}

	header := make([]byte, 4)
	binary.LittleEndian.PutUint32(header, uint32(len(payload)))

	w.mu.Lock()
	defer w.mu.Unlock()

	if _, err := w.target.Write(header); err != nil {
		return err
	}
	_, err = w.target.Write(payload)
	return err
}

func ReadNativeMessage(source io.Reader) (NativeMessage, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(source, header); err != nil {
		return NativeMessage{}, err
	}

	length := binary.LittleEndian.Uint32(header)
	if length > MaxIncomingNativeMessageBytes {
		return NativeMessage{}, fmt.Errorf("native message of %d bytes exceeds the %d byte limit", length, MaxIncomingNativeMessageBytes)
	}
	payload := make([]byte, int(length))
	if _, err := io.ReadFull(source, payload); err != nil {
		return NativeMessage{}, err
	}

	var message NativeMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return NativeMessage{}, err
	}
	return message, nil
}
