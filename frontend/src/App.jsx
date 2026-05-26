import { useState }           from "react";
import { GLOBAL_CSS }         from "./constants/theme.js";
import { useDiscovery }       from "./hooks/useDiscovery.js";
import { useRunner }          from "./hooks/useRunner.js";
import { useApiHealth }       from "./hooks/useApiHealth.js";
import { Header }             from "./components/shared/Header.jsx";
import { ApiKeyBanner }       from "./components/shared/ApiKeyBanner.jsx";

// Views
import { DiscoveryView }      from "./components/discovery/DiscoveryView.jsx";
import { RunView }            from "./components/run/RunView.jsx";
import { ResultsView }        from "./components/results/ResultsView.jsx";
import { ContextView }        from "./components/context/ContextView.jsx";
import { SettingsView }       from "./components/settings/SettingsView.jsx";

export default function App() {
  const [nav, setNav]         = useState("discover");
  const [runTab, setRunTab]   = useState("runner");   // runner | api
  const [ctxTab, setCtxTab]   = useState("repos");    // repos | integrations
  const [setTab, setSetTab]   = useState("vault");    // vault | git | mcp

  const disc      = useDiscovery();
  const runner    = useRunner();
  const apiHealth = useApiHealth();

  const handleRerun = (run) => {
    const useCase = {
      id: run.id, title: run.name,
      steps:      run.steps?.map(s => s.description || "") ?? [],
      assertions: run.assertions?.map(a => a.assertion) ?? [],
    };
    runner.resetRunner();
    setNav("run"); setRunTab("runner");
    const kick = () => runner.runUseCase(useCase, run.url, {});
    if (runner.wsStatus === "connected") kick();
    else { runner.connect(); setTimeout(kick, 1800); }
  };

  const handleLaunchRun = (singleUC, suite) => {
    runner.resetRunner();
    setNav("run"); setRunTab("runner");
    const kick = () => {
      if (singleUC) runner.runUseCase(singleUC, disc.url, {});
      else if (suite) runner.runSuite(suite, disc.url, {});
    };
    if (runner.wsStatus === "connected") kick();
    else { runner.connect(); setTimeout(kick, 1800); }
  };

  return (
    <div style={{ fontFamily:"'IBM Plex Mono','Courier New',monospace", background:"#080c0f", minHeight:"100vh", color:"#c8d8e8" }}>
      <style>{GLOBAL_CSS}</style>
      <Header
        nav={nav} setNav={setNav}
        wsStatus={runner.wsStatus} onConnect={runner.connect}
        resultsBadge={runner.resultsBadge}
        apiHealth={apiHealth}
      />
      <ApiKeyBanner apiHealth={apiHealth} onRecheck={apiHealth.recheck} />

      {nav === "discover" && (
        <DiscoveryView disc={disc} onLaunchRun={handleLaunchRun} />
      )}
      {nav === "run" && (
        <RunView
          runner={runner} disc={disc}
          activeTab={runTab} setActiveTab={setRunTab}
          onBack={() => setNav("discover")}
          onGoToResults={() => setNav("results")}
        />
      )}
      {nav === "results" && (
        <ResultsView
          onRunComplete={runner.onRunComplete}
          onRerun={handleRerun}
        />
      )}
      {nav === "context" && (
        <ContextView activeTab={ctxTab} setActiveTab={setCtxTab} url={disc.url} />
      )}
      {nav === "settings" && (
        <SettingsView activeTab={setTab} setActiveTab={setSetTab} />
      )}
    </div>
  );
}
