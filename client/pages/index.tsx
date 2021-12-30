import {
  Box,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Select,
  Stack,
  Tooltip,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import {
  ChangeEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FaFacebook, FaTwitter } from 'react-icons/fa'
import {
  MdContentCopy,
  MdPhotoCamera,
  MdScreenShare,
  MdShare,
  MdStop,
} from 'react-icons/md'
import { v4 } from 'uuid'
import { ExternalLink } from '~/components/Link'
import EncodeWorker from '~/workers/encode?worker'

const Index = () => {
  const worker = useRef<Worker>()
  const video = useRef<HTMLVideoElement>(null)
  const currentTrack = useRef<MediaStreamVideoTrack>()
  const [isConnecting, setIsConnecting] = useState(false)
  const [mediaDeviceInfo, setMediaDeviceInfo] = useState<MediaDeviceInfo[]>([])
  const [roomId] = useState(v4())
  const { isOpen, onOpen, onClose } = useDisclosure()
  const shareURL = useMemo(() => `${location.href}${roomId}`, [roomId])
  const toast = useToast()

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shareURL)
    toast({
      description: 'リンクをクリップボードにコピーしました。',
      position: 'top-right',
    })
  }, [shareURL])

  const updateMediaDeviceInfo = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoInputs = devices.filter((device) => device.kind === 'videoinput')
    setMediaDeviceInfo(videoInputs)
  }, [])

  const handleStartScreenSharing = useCallback(async () => {
    if (video.current === null) return
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 1920,
        height: 1080,
      },
    })
    handleStartSharing(stream)
  }, [])

  const handleChangeCamera: ChangeEventHandler<HTMLSelectElement> = useCallback(
    async (event) => {
      const deviceId = event.target.value
      if (deviceId === '') return handleStopStreaming()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 1920,
          height: 1080,
          deviceId: event.target.value,
        },
      })
      handleStartSharing(stream)
    },
    []
  )

  const handleStartSharing = useCallback(
    (source: MediaStream) => {
      if (video.current === null) return
      const [track] = source.getVideoTracks()
      const generator = new MediaStreamTrackGenerator({ kind: 'video' })
      const processor = new MediaStreamTrackProcessor({ track })
      worker.current = new EncodeWorker()
      worker.current.postMessage(
        {
          type: 'connect',
          width: video.current.width,
          height: video.current.height,
          roomId,
          readable: processor.readable,
          writable: generator.writable,
        },
        // @ts-expect-error
        [processor.readable, generator.writable]
      )

      const mediaStream = new MediaStream()
      mediaStream.addTrack(generator)
      video.current.onloadedmetadata = () => video.current?.play()
      video.current.srcObject = mediaStream
      currentTrack.current = track
      track.onended = () => handleStopStreaming()
      setIsConnecting(true)
      onOpen()
    },
    [roomId]
  )

  const handleStopStreaming = useCallback(async () => {
    currentTrack.current?.stop()
    worker.current?.postMessage({ type: 'disconnect' })
    setIsConnecting(false)
  }, [])

  useEffect(() => {
    return () => worker.current?.postMessage({ type: 'disconnect' })
  }, [])

  return (
    <>
      <Box
        bg="black"
        display="flex"
        height="100%"
        justifyContent="center"
        position="relative"
        width="100%"
      >
        <Box height="100%" style={{ aspectRatio: '16 / 9' }} width="100%">
          <video
            ref={video}
            height={1080}
            style={{
              backgroundColor: '#000',
              width: '100%',
              height: '100%',
            }}
            width={1920}
          />
        </Box>
        <Stack bottom="20" direction="row" position="absolute" spacing={8}>
          <Tooltip label="画面共有">
            <IconButton
              aria-label="画面共有"
              colorScheme="blue"
              icon={<Icon as={MdScreenShare} h={6} w={6} />}
              onClick={handleStartScreenSharing}
              size="lg"
              isRound
            />
          </Tooltip>
          <Popover placement="top">
            <PopoverTrigger>
              <Box>
                <Tooltip label="カメラ共有">
                  <IconButton
                    aria-label="カメラ共有"
                    colorScheme="blue"
                    icon={<Icon as={MdPhotoCamera} h={6} w={6} />}
                    onClick={updateMediaDeviceInfo}
                    size="lg"
                    isRound
                  />
                </Tooltip>
              </Box>
            </PopoverTrigger>
            <Portal>
              <PopoverContent>
                <PopoverArrow />
                <PopoverBody>
                  <Select
                    onChange={handleChangeCamera}
                    placeholder="カメラを選択"
                  >
                    {mediaDeviceInfo.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </Select>
                </PopoverBody>
              </PopoverContent>
            </Portal>
          </Popover>
          <Tooltip label="シェア">
            <IconButton
              aria-label="シェア"
              colorScheme="blue"
              icon={<Icon as={MdShare} h={6} w={6} />}
              onClick={onOpen}
              size="lg"
              isRound
            />
          </Tooltip>
          <Tooltip label="配信停止">
            <IconButton
              aria-label="配信停止"
              colorScheme="red"
              disabled={!isConnecting}
              icon={<Icon as={MdStop} h={6} w={6} />}
              onClick={handleStopStreaming}
              size="lg"
              isRound
            />
          </Tooltip>
        </Stack>
      </Box>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>シェア</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack direction="row" marginBottom={4} spacing={4}>
              <ExternalLink
                href={`https://twitter.com/intent/tweet?text=${decodeURIComponent(
                  shareURL
                )}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconButton
                  aria-label="Twitter"
                  colorScheme="twitter"
                  icon={<Icon as={FaTwitter} h={6} w={6} />}
                  size="lg"
                  isRound
                />
              </ExternalLink>
              <ExternalLink
                href={`https://www.facebook.com/sharer/sharer.php?u=${decodeURIComponent(
                  shareURL
                )}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconButton
                  aria-label="Facebook"
                  colorScheme="facebook"
                  icon={<Icon as={FaFacebook} h={6} w={6} />}
                  size="lg"
                  isRound
                />
              </ExternalLink>
            </Stack>
            <InputGroup marginBottom={4}>
              <Input type="text" value={shareURL} readOnly />
              <InputRightAddon
                aria-label="URL をコピー"
                as={IconButton}
                icon={<Icon as={MdContentCopy} />}
                onClick={handleCopy}
              />
            </InputGroup>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}

export default Index
