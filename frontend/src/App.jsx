import { useState }        from "react";
import { GLOBAL_CSS }      from "./constants/theme.js";
import { useDiscovery }    from "./hooks/useDiscovery.js";
import { useRunner }       from "./hooks/useRunner.js";
import { Header }          from "./components/shared/Header.jsx";
import { DiscoveryView }   from "./components/discovery/DiscoveryView.jsx";
import { RunnerView }      from "./components/runner/RunnerView.jsx";
import { ApiAgentView }    from "./components/api/ApiAgentView.jsx";
import { VaultView }       from "./components/vault/VaultView.jsx";
import { ResultsView }     from "./components/results/ResultsView.jsx";

export default function App() {
  const [mainView, setMainView] = useState("discovery");
  const disc   = useDiscovery();
  const runner = useRunner();

  const handleLaunchRun = (singleUC, suite) => {
    runner.resetRunner();
    setMainView("runner");
    const kick = () => {
      if (singleUC) runner.runUseCase(singleUC, disc.url, { username: disc.username, password: disc.password });
      else if (suite) runner.runSuite(suite, disc.url, { username: disc.username, password: disc.password });
    };
    if (runner.wsStatus === "connected") kick();
    else { runner.connect(); setTimeout(kick, 1800); }
  };

  return (
    <div style={{ fontFamily:"'IBM Plex Mono','Courier New',monospace", background:"#080c0f", minHeight:"100vh", color:"#c8d8e8" }}>
      <style>{GLOBAL_CSS}</style>
      <Header wsStatus={runner.wsStatus} onConnect={runner.connect} mainView={mainView} setMainView={setMainView} />
      {mainView === "discovery" && <DiscoveryView disc={disc} onLaunchRun={handleLaunchRun} />}
      {mainView === "runner"    && <RunnerView runner={runner} onBack={() => setMainView("discovery")} />}
      {mainView === "api"       && <ApiAgentView />}
      {mainView === "vault"     && <VaultView />}
      {mainView === "results"   && <ResultsView />}
    </div>
  );
}
