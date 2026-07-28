import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { frontendRouteTree } from "./frontend-route-tree";

export const getFrontendRouter = () => {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree: frontendRouteTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};
