import { createFileRoute, redirect } from "@tanstack/react-router";
import { currentUser } from "@/lib/pleng/api";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { user } = await currentUser();
    throw redirect({ to: user ? "/dashboard" : "/auth" });
  },
  component: () => null,
});
