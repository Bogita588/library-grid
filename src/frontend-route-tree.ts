import { frontendRootRoute } from "./frontend-root-route";
import { Route as IndexRouteImport } from "./routes/index";
import { Route as AuthenticatedRouteImport } from "./routes/_authenticated/route";
import { Route as AuthRouteImport } from "./routes/auth";
import { Route as AdminRouteImport } from "./routes/_authenticated/admin";
import { Route as DashboardRouteImport } from "./routes/_authenticated/dashboard";
import { Route as FavoritesRouteImport } from "./routes/_authenticated/favorites";
import { Route as LibraryRouteImport } from "./routes/_authenticated/library";
import { Route as LibraryDocRouteImport } from "./routes/_authenticated/library.$docId";

const IndexRoute = IndexRouteImport.update({
  id: "/",
  path: "/",
  getParentRoute: () => frontendRootRoute,
} as never);

const AuthRoute = AuthRouteImport.update({
  id: "/auth",
  path: "/auth",
  getParentRoute: () => frontendRootRoute,
} as never);

const AuthenticatedRoute = AuthenticatedRouteImport.update({
  id: "/_authenticated",
  getParentRoute: () => frontendRootRoute,
} as never);

const AdminRoute = AdminRouteImport.update({
  id: "/admin",
  path: "/admin",
  getParentRoute: () => AuthenticatedRoute,
} as never);

const DashboardRoute = DashboardRouteImport.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => AuthenticatedRoute,
} as never);

const FavoritesRoute = FavoritesRouteImport.update({
  id: "/favorites",
  path: "/favorites",
  getParentRoute: () => AuthenticatedRoute,
} as never);

const LibraryRoute = LibraryRouteImport.update({
  id: "/library",
  path: "/library",
  getParentRoute: () => AuthenticatedRoute,
} as never);

const LibraryDocRoute = LibraryDocRouteImport.update({
  id: "/$docId",
  path: "/$docId",
  getParentRoute: () => LibraryRoute,
} as never);

const LibraryRouteWithChildren = LibraryRoute._addFileChildren({
  LibraryDocRoute,
});

const AuthenticatedRouteWithChildren = AuthenticatedRoute._addFileChildren({
  AdminRoute,
  DashboardRoute,
  FavoritesRoute,
  LibraryRoute: LibraryRouteWithChildren,
});

export const frontendRouteTree = frontendRootRoute._addFileChildren({
  IndexRoute,
  AuthenticatedRoute: AuthenticatedRouteWithChildren,
  AuthRoute,
});
