import { useState }                    from "react";
import { InputPanel }                  from "./InputPanel.jsx";
import { UseCaseList }                 from "./UseCaseList.jsx";
import { UseCaseDetail }               from "./UseCaseDetail.jsx";
import { EndpointList }                from "./EndpointList.jsx";
import { SuiteList }                   from "./SuiteList.jsx";
import { LogPanel }                    from "../shared/LogPanel.jsx";
import { AdvancedDiscoveryPanel }      from "./AdvancedDiscoveryPanel.jsx";
import { CodeIntelligencePanel }       from "../intelligence/CodeIntelligencePanel.jsx";
import { ExportProjectModal }          from "../testbed/ExportProjectModal.jsx";
import { useAdvancedDiscovery }        from "../../hooks/useAdvancedDiscovery.js";

export function DiscoveryView({ disc, onLaunchRun }) {
  const {
    url, setUrl, credentialId, onCredentialChange,
    phase, log, logRef, plan, setPlan, discover, cancelDiscovery,
    selectedUC, scenario, scenLoading, generateScenario,
    filterPriority, setFilterPriority, filterCategory, setFilterCategory,
    filteredUCs, categories, savedSuite, toggleSuite,
    activeTab, setActiveTab,
  } = disc;

  const [mainMode, setMainMode] = useState("quick"); // quick | advanced
  const [showExport, setShowExport] = useState(false);
  const adv = useAdvancedDiscovery();

  const handleAdvancedDiscover = () => {
    setMainMode("advanced");
    adv.run(url, credentialId);
  };

  const handleMergePlan = (advPlan) => {
    // Merge advanced plan into quick discovery state so runner works
    disc.setPlan?.(advPlan);
    setMainMode("quick");
  };

  const activePlan = mainMode === "advanced" && adv.plan ? adv.plan : plan;

  return (
    <>
    <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>
      {/* ── Left: input + log ── */}
      <div style={{ width:290, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <InputPanel
          url={url} setUrl={setUrl}
          credentialId={credentialId} onCredentialChange={onCredentialChange}
          phase={phase} onDiscover={() => { setMainMode("quick"); discover(); }} onCancel={cancelDiscovery}
          onAdvancedDiscover={handleAdvancedDiscover}
          advancedPhase={adv.phase}
        />

        {/* Mode indicator */}
        {mainMode === "advanced" && adv.phase !== "idle" && (
          <div style={{ padding:"5px 14px", background:"#0a0a1a", borderBottom:"0.5px solid #5b3a8a", fontSize:9, color:"#c8a0f0", letterSpacing:"0.08em" }}>
            🔬 ADVANCED DISCOVERY RUNNING
          </div>
        )}

        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"6px 14px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>
          {mainMode === "advanced" ? "Advanced log" : "Discovery log"}
        </div>
        <LogPanel
          log={mainMode === "advanced" ? adv.log : log}
          logRef={mainMode === "advanced" ? adv.logRef : logRef}
          isLoading={mainMode === "advanced" ? adv.phase === "running" : phase === "discovering"}
          emptyText={"Enter a URL and\npress DISCOVER"}
        />

        {/* Quick plan info */}
        {mainMode === "quick" && plan && (
          <div style={{ padding:"10px 14px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>{plan.appName}</div>
            <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.06em" }}>{plan.appType}</div>
            <div style={{ fontSize:10, color:"#6a9ab8", lineHeight:1.6 }}>{plan.summary}</div>
          </div>
        )}
      </div>

      {/* ── Main panel ── */}
      {mainMode === "advanced" && adv.phase !== "idle" ? (
        <AdvancedDiscoveryPanel
          adv={adv}
          onLaunchRun={onLaunchRun}
          onMergePlan={handleMergePlan}
        />
      ) : (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {!activePlan ? (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex" }}>
                <button className={`tab ${activeTab==="code"?"on":""}`} onClick={() => setActiveTab("code")}>🔬 CODE INTEL</button>
              </div>
              {activeTab === "code" ? (
                <div style={{ flex:1, overflow:"hidden" }}>
                  <CodeIntelligencePanel url={url} navLinks={[]} />
                </div>
              ) : (
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:28 }}>🔍</div>
                  <div style={{ fontSize:12, color:"#2d6aad", letterSpacing:"0.08em" }}>Awaiting target URL</div>
                  <div style={{ fontSize:10, color:"#1e3a5f", maxWidth:280, textAlign:"center", lineHeight:1.9 }}>
                    <strong style={{ color:"#4a7fa5" }}>Quick</strong> — fast AI scan, 7 use cases<br/>
                    <strong style={{ color:"#a080d0" }}>Advanced</strong> — navigates app, maps all features<br/>
                    <strong style={{ color:"#c8a0f0" }}>Code Intel</strong> — detects hidden/dead code
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"center", overflowX:"auto" }}>
                {[["usecases",`USE CASES (${activePlan.useCases?.length??0})`],["endpoints",`API (${activePlan.apiEndpoints?.length??0})`],["suites",`SUITES (${activePlan.suggestedSuites?.length??0})`],["code","🔬 CODE INTEL"]].map(([t,l])=>(
                  <button key={t} className={`tab ${activeTab===t?"on":""}`} onClick={()=>setActiveTab(t)}>{l}</button>
                ))}
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
                  {savedSuite.length > 0 && (
                    <>
                      <span style={{ fontSize:9, color:"#4caf50" }}>✓ {savedSuite.length} in suite</span>
                      <button className="rb" style={{ fontSize:10, padding:"3px 10px" }}
                        onClick={() => onLaunchRun(null, activePlan.useCases.filter(u => savedSuite.includes(u.id)))}>
                        ▶ RUN SUITE
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowExport(true)}
                    style={{ background:"linear-gradient(135deg,#1a0a2e,#0a0a1e)", border:"0.5px solid #c8a0f0", borderRadius:5, color:"#c8a0f0", cursor:"pointer", fontSize:10, fontWeight:600, padding:"4px 12px", fontFamily:"inherit", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>
                    🧪 Export Project
                  </button>
                </div>
              </div>

              {activeTab === "usecases" && (
                <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
                  <UseCaseList
                    useCases={filteredUCs.length ? filteredUCs : (activePlan.useCases ?? [])}
                    selectedId={selectedUC?.id} savedSuite={savedSuite}
                    filterPriority={filterPriority} setFilterPriority={setFilterPriority}
                    filterCategory={filterCategory} setFilterCategory={setFilterCategory}
                    categories={categories.length ? categories : [...new Set((activePlan.useCases??[]).map(u=>u.category))]}
                    onSelect={generateScenario} onToggleSuite={toggleSuite}
                    onRun={uc => onLaunchRun(uc)}
                  />
                  <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
                    <UseCaseDetail useCase={selectedUC} scenario={scenario} scenLoading={scenLoading} onRun={uc => onLaunchRun(uc)} />
                  </div>
                </div>
              )}
              {activeTab === "endpoints" && <EndpointList endpoints={activePlan.apiEndpoints} />}
              {activeTab === "suites" && (
                <SuiteList suites={activePlan.suggestedSuites} useCases={activePlan.useCases??[]} savedSuite={savedSuite}
                  onRunSuite={s => onLaunchRun(null, (activePlan.useCases??[]).filter(u => s.useCaseIds?.includes(u.id)))}
                  onSelectUC={uc => { setActiveTab("usecases"); generateScenario(uc); }} />
              )}
              {activeTab === "code" && (
                <div style={{ flex:1, overflow:"hidden" }}>
                  <CodeIntelligencePanel
                    url={url}
                    navLinks={activePlan.apiEndpoints?.map(e => ({ href: url + e.path, text: e.path })) ?? []}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>

    {showExport && activePlan && (
      <ExportProjectModal
        plan={activePlan}
        url={url}
        onClose={() => setShowExport(false)}
      />
    )}
    </>
  );
}
