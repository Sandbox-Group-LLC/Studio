import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Kiosk from "@/pages/Kiosk";
import TrackPage from "@/pages/Track";
import Ops from "@/pages/Ops";

function AppRouter() {
  return (
    <Switch>
      {/* Booth touchscreen */}
      <Route path="/" component={Kiosk} />
      {/* Attendee phone, reached via the kiosk QR */}
      <Route path="/t/:code" component={TrackPage} />
      {/* Floor operator dashboard */}
      <Route path="/ops" component={Ops} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
