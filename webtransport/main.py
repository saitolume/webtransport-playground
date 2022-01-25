import argparse
import asyncio
import logging
import re

from collections import defaultdict
from dotenv import dotenv_values
from typing import Any, Dict, Optional

from aioquic.asyncio import QuicConnectionProtocol, serve
from aioquic.h3.connection import H3_ALPN, H3Connection, Setting
from aioquic.h3.events import H3Event, HeadersReceived, DatagramReceived
from aioquic.quic.configuration import QuicConfiguration
from aioquic.quic.events import ProtocolNegotiated, StreamReset, QuicEvent
from aioquic.quic.logger import QuicLogger

BIND_ADDRESS = '::'
UUID_FORMAT = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

logger = logging.getLogger(__name__)
quic_logger = QuicLogger()
logging.basicConfig(level=logging.DEBUG)
env = dotenv_values('../.env.local')

# https://datatracker.ietf.org/doc/html/draft-ietf-masque-h3-datagram-05#section-9.1
H3_DATAGRAM_05 = 0xffd277
# https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-h3-websockets-00#section-5
ENABLE_CONNECT_PROTOCOL = 0x08

class H3ConnectionWithDatagram(H3Connection):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)

    def _validate_settings(self, settings: Dict[int, int]) -> None:
        settings[Setting.H3_DATAGRAM] = 1
        return super()._validate_settings(settings)

    def _get_local_settings(self) -> Dict[int, int]:
        settings = super()._get_local_settings()
        settings[H3_DATAGRAM_05] = 1
        settings[ENABLE_CONNECT_PROTOCOL] = 1
        return settings

viewers = defaultdict(Any)

class VideoReceiver:
    def __init__(self, stream_id: int, room_id: int, http: H3ConnectionWithDatagram) -> None:
        self._room_id = room_id
        self._stream_id = stream_id
        self._http = http
        self._buf = defaultdict(bytes)

    def h3_event_received(self, event: H3Event) -> None:
        if isinstance(event, DatagramReceived):
            for viewer in viewers.values():
                if viewer['room_id'] == self._room_id:
                    viewer['connection'].send_datagram(viewer['stream_id'], event.data)
                    viewer['protocol'].transmit()

    def stream_closed(self, stream_id: int) -> None:
        try:
            del self._buf[stream_id]
        except KeyError:
            pass

class VideoSender:
    def __init__(self, stream_id: int, room_id: int, http: H3ConnectionWithDatagram, protocol: QuicConnectionProtocol) -> None:
        self._connection_id = http._quic.host_cid
        viewers[self._connection_id] = {
            'protocol': protocol,
            'connection': http,
            'stream_id': stream_id,
            'room_id': room_id,
        }

    def h3_event_received(self, event: H3Event) -> None:
        return

    def session_closed(self) -> None:
        try:
            del viewers[self._connection_id]
        except KeyError:
            pass

class WebTransportProtocol(QuicConnectionProtocol):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._http: Optional[H3ConnectionWithDatagram] = None
        self._handler = None

    def quic_event_received(self, event: QuicEvent) -> None:
        if isinstance(event, ProtocolNegotiated):
            self._http = H3ConnectionWithDatagram(self._quic, enable_webtransport=True)
        elif isinstance(event, StreamReset) and self._handler is not None:
            self._handler.stream_closed(event.stream_id)

        if self._http is not None:
            for h3_event in self._http.handle_event(event):
                self._h3_event_received(h3_event)

    def _h3_event_received(self, event: H3Event) -> None:
        if isinstance(event, HeadersReceived):
            headers = {}
            for header, value in event.headers:
                headers[header] = value
            if (headers.get(b':method') == b'CONNECT' and headers.get(b':protocol') == b'webtransport'):
                self._handshake_webtransport(event.stream_id, headers)
            else:
                self._send_response(event.stream_id, 400, end_stream=True)

        if self._handler:
            self._handler.h3_event_received(event)

    def _handshake_webtransport(self, stream_id: int, request_headers: Dict[bytes, bytes]) -> None:
        path = request_headers.get(b':path').decode()
        match path:
            case path if re.match(fr'/streams/{UUID_FORMAT}', path):
                assert(self._handler is None)
                [room_id] = re.findall(UUID_FORMAT, path)
                self._handler = VideoReceiver(stream_id, room_id, self._http)
                self._send_response(stream_id, 200)
            case path if re.match(fr'/{UUID_FORMAT}', path):
                assert(self._handler is None)
                [room_id] = re.findall(UUID_FORMAT, path)
                self._handler = VideoSender(stream_id, room_id, self._http, self)
                self._send_response(stream_id, 200)
            case _:
                self._send_response(stream_id, 404, end_stream=True)

    def _send_response(self, stream_id: int, status_code: int, end_stream=False) -> None:
        headers = [(b':status', str(status_code).encode())]
        if status_code == 200:
            headers.append((b'sec-webtransport-http3-draft', b'draft02'))
        self._http.send_headers(stream_id=stream_id, headers=headers, end_stream=end_stream)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('certificate')
    parser.add_argument('key')
    args = parser.parse_args()

    configuration = QuicConfiguration(
        alpn_protocols=H3_ALPN,
        is_client=False,
        max_datagram_frame_size=65536,
        quic_logger=quic_logger,
    )
    configuration.load_cert_chain(args.certificate, args.key)

    loop = asyncio.new_event_loop()
    loop.run_until_complete(
        serve(
            BIND_ADDRESS,
            env['PORT'],
            configuration=configuration,
            create_protocol=WebTransportProtocol,
        ))
    try:
        logging.info('Listening on https://{}:{}'.format(BIND_ADDRESS, env['PORT']))
        loop.run_forever()
    except KeyboardInterrupt:
        pass
