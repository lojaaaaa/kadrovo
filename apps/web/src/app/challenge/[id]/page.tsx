import { ChallengeView } from '@/components/challenge-view';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="screen py-8">
      <ChallengeView id={id} />
    </main>
  );
}
