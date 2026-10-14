import { redirect } from "next/navigation";

// Destinations are edited inline in the route's pipeline.
export default async function DestinationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/endpoints#route-${encodeURIComponent(id)}`);
}
