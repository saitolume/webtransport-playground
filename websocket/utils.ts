export const UUID_FORMAT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

export const getRoomIdFromURL = (value: string) => {
  const { pathname } = new URL(value);
  const roomId = pathname.match(UUID_FORMAT)?.[0];
  return roomId ?? null;
};
