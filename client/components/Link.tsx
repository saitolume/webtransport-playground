import { Link as ChakraLink } from '@chakra-ui/react'
import { ComponentPropsWithoutRef, VFC } from 'react'
import { Link as ReactLocationLink, LinkProps } from 'react-location'

export const Link: VFC<LinkProps> = ({ children, ...props }) => (
  <ChakraLink as={ReactLocationLink} {...props}>
    {children}
  </ChakraLink>
)

export const ExternalLink: VFC<ComponentPropsWithoutRef<typeof ChakraLink>> = ({
  children,
  ...props
}) => <ChakraLink {...props}>{children}</ChakraLink>
