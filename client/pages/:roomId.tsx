import { Box, CircularProgress } from '@chakra-ui/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  VFC,
} from 'react'
import { useMatch } from 'react-location'
import DecoderWorker from '~/workers/decode?worker'

const RoomId: VFC = () => {
  const video = useRef<HTMLVideoElement>(null)
  const decoder = useRef<Worker>()
  const mediaStream = useRef(new MediaStream())
  const trackGenerator = useRef<MediaStreamVideoTrackGenerator>()
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const {
    params: { roomId },
  } = useMatch()

  const handlePlay = useCallback(() => {
    if (video.current === null) return
    setIsPlaying(true)
    const worker = new DecoderWorker()
    const track = new MediaStreamTrackGenerator({ kind: 'video' })
    const writable = track.writable
    // @ts-expect-error WritableStream は厳密には Transferable ではないが所有権を Worker に渡すことができる
    worker.postMessage(
      {
        type: 'connect',
        writable,
        roomId,
      },
      [writable]
    )
    worker.onmessage = async ({ data }) => {
      switch (data.type) {
        case 'reconnect': {
          handlePause()
          handlePlay()
          setIsLoading(false)
          break
        }
        case 'disconnect': {
          setIsLoading(true)
          break
        }
      }
    }

    trackGenerator.current = track
    decoder.current = worker
    mediaStream.current.addTrack(trackGenerator.current)
  }, [roomId])

  const handlePause = useCallback(async () => {
    setIsPlaying(false)
    decoder.current?.postMessage({ type: 'disconnect' })
    decoder.current?.terminate()
    if (trackGenerator.current) {
      mediaStream.current.removeTrack(trackGenerator.current)
    }
  }, [handlePlay])

  useLayoutEffect(() => {
    if (video.current === null) return
    video.current.srcObject = mediaStream.current
  }, [])

  useEffect(() => {
    return () => decoder.current?.postMessage({ type: 'disconnect' })
  }, [])

  return (
    <Box
      alignItems="center"
      bg="black"
      display="flex"
      height="100%"
      justifyContent="center"
      position="relative"
      style={{ aspectRatio: '16 / 9' }}
      width="100%"
    >
      {isLoading && isPlaying && (
        <CircularProgress
          color="black"
          position="absolute"
          size="100px"
          thickness="4px"
          zIndex={1}
          capIsRound
          isIndeterminate
        />
      )}
      <video
        ref={video}
        height={1080}
        onPause={handlePause}
        onPlay={handlePlay}
        style={{
          backgroundColor: '#000',
          width: '100%',
          height: '100%',
          cursor: 'pointer',
        }}
        width={1920}
        controls
      />
    </Box>
  )
}

export default RoomId
