import { InputPanel }     from "./InputPanel.jsx";
import { UseCaseList }    from "./UseCaseList.jsx";
import { UseCaseDetail }  from "./UseCaseDetail.jsx";
import { EndpointList }   from "./EndpointList.jsx";
import { SuiteList }      from "./SuiteList.jsx";
import { LogPanel }       from "../shared/LogPanel.jsx";

export function DiscoveryView({ disc, runner, onLaunchRun }) {
  const {
    url, setUrl, username, setUsername, password, setPassword, showCreds, setShowCreds,
    phase, log, logRef, plan, discover, cancelDiscovery,
    selectedUC, scenario, scenLoading, generateScenario,
    filterPriority, setFilterPriority, filterCategory, setFilterCategory,
    filteredUCs, categories, savedSuite, toggleSuite,
    activeTab, setActiveTab,
  } = disc;

  const handleRunSuite = (suite) => {
    const ucs = plan.useCases.filter(u => suite.useCaseIds.includes(u.id));
    onLaunchRun(null, ucs);
  };

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>

      {/* ── Left: input + log ── */}
      <div style={{ width:290, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <InputPanel
          url={url} setUrl={setUrl}
          username={username} setUsername={setUsername}
          password={password} setPassword={setPassword}
          showCreds={showCreds} setShowCreds={setShowCreds}
          phase={phase} onDiscover={discover} onCancel={cancelDiscovery}
        />
        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"6px 14px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>Discovery log</div>
        <LogPanel log={log} logRef={logRef} isLoading={phase==="discovering"} emptyText={"Enter a URL and\npress DISCOVER"} />
        {plan && (
          <div style={{ padding:"10px 14px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>{plan.appName}</div>
            <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.06em" }}>{plan.appType}</div>
            <div style={{ fontSize:10, color:"#6a9ab8", lineHeight:1.6 }}>{plan.summary}</div>
          </div>
        )}
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {!plan ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:28 }}>🔍</div>
            <div style={{ fontSize:12, color:"#2d6aad", letterSpacing:"0.08em" }}>Awaiting target URL</div>
            <div style={{ fontSize:10, color:"#1e3a5f", maxWidth:260, textAlign:"center", lineHeight:1.8 }}>
              Try: asics.com · salesforce.com<br/>github.com · shopify.com
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"center", overflowX:"auto" }}>
              {[
                ["usecases", `USE CASES (${plan.useCases.length})`],
                ["endpoints", `API (${plan.apiEndpoints?.length ?? 0})`],
                ["suites",    `SUITES (${plan.suggestedSuites?.length ?? 0})`],
              ].map(([t, l]) => (
                <button key={t} className={`tab ${activeTab===t?"on":""}`} onClick={() => setActiveTab(t)}>{l}</button>
              ))}
              {savedSuite.length > 0 && (
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:9, color:"#4caf50" }}>✓ {savedSuite.length} in suite</span>
                  <button className="rb" style={{ fontSize:10, padding:"3px 10px" }}
                    onClick={() => onLaunchRun(null, plan.useCases.filter(u => savedSuite.includes(u.id)))}>
                    ▶ RUN SUITE
                  </button>
                </div>
              )}
            </div>

            {activeTab === "usecases" && (
              <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
                <UseCaseList
                  useCases={filteredUCs}
                  selectedId={selectedUC?.id}
                  savedSuite={savedSuite}
                  filterPriority={filterPriority} setFilterPriority={setFilterPriority}
                  filterCategory={filterCategory} setFilterCategory={setFilterCategory}
                  categories={categories}
                  onSelect={generateScenario}
                  onToggleSuite={toggleSuite}
                  onRun={uc => onLaunchRun(uc)}
                />
                <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
                  <UseCaseDetail useCase={selectedUC} scenario={scenario} scenLoading={scenLoading} onRun={uc => onLaunchRun(uc)} />
                </div>
              </div>
            )}

            {activeTab === "endpoints" && (
              <EndpointList endpoints={plan.apiEndpoints} />
            )}

            {activeTab === "suites" && (
              <SuiteList
                suites={plan.suggestedSuites}
                useCases={plan.useCases}
                savedSuite={savedSuite}
                onRunSuite={handleRunSuite}
                onSelectUC={(uc) => { setActiveTab("usecases"); generateScenario(uc); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
