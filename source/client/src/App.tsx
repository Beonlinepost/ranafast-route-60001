import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import RoutesPage from "./pages/RoutesPage";
import RouteView from "./pages/RouteView";
import ShareView from "./pages/ShareView";
import MapView from "./pages/MapView";
import PrintView from "./pages/PrintView";
import AdminPanel from "./pages/AdminPanel";

function Router() {
  const [location] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const isAdmin = user?.role === "admin";

  // Admin panel is now open to all authenticated users

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/routes" component={RoutesPage} />
      <Route path="/route/:id" component={RouteView} />
      <Route path="/admin" component={AdminPanel} />

      <Route path="/share/:token" component={ShareView} />
      <Route path="/map" component={MapView} />
      <Route path="/print" component={PrintView} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
