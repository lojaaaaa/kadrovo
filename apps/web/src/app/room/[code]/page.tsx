import { RoomLobby } from '@/components/room-lobby';
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <RoomLobby code={code.toUpperCase()} />;
}
