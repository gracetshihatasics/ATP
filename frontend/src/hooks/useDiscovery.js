import { useState, useRef, useCallback } from "react";
import { discoverPlan, generateScenario } from "../utils/claude.js";
import { resolveContext }                 from "../services/vault.js";
import { sleep }                          from "../utils/helpers.js";

export function useDiscovery() {
  const [url, setUrl]                   = useState("");
  const [credentialId, setCredentialId] = useState(null);
  const [credentialEntry, setCredentialEntry] = useState(null);

  const [phase, setPhase]               = useState("idle");
  const [log, setLog]                   = useState([]);
  const [plan, setPlan]                 = useState(null);
  const [selectedUC, setSelectedUC]     = useState(null);
  const [scenario, setScenario]         = useState(null);
  const [scenLoading, setSceLoading]    = useState(false);
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [savedSuite, setSavedSuite]         = useState([]);
  const [activeTab, setActiveTab]           = useState("usecases");

  const abortRef = useRef(null);
  const logRef   = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    setLog(prev => [...prev, { msg, type }]);
    setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
  }, []);

  const onCredentialChange = (id, entry) => {
    setCredentialId(id);
    setCredentialEntry(entry);
  };

  const discover = async () => {
    if (!url.trim()) return;
    setPhase("discovering");
    setPlan(null); setSelectedUC(null); setScenario(null); setLog([]); setSavedSuite([]);

    try {
      addLog("Initialising discovery engine...", "system"); await sleep(300);
      addLog(`Targeting: ${url}`);                          await sleep(300);
      addLog("Analysing application structure & domain..."); await sleep(400);
      addLog("Inferring app type and user roles...");        await sleep(400);
      addLog("Mapping possible user flows...");              await sleep(500);

      // Resolve credentials from vault if one is selected
      let credentials = {};
      if (credentialId) {
        addLog(`Resolving credentials from vault...`, "ai");
        credentials = await resolveContext(credentialId);
        addLog(`Injected ${Object.keys(credentials).length} credential fields`, "success");
      }

      addLog("Generating use cases with AI...", "ai");
      const parsed = await discoverPlan({ url, credentials });

      addLog(`Discovered ${parsed.useCases?.length ?? 0} use cases`, "success");
      addLog(`Identified ${parsed.apiEndpoints?.length ?? 0} API endpoints`, "success");
      addLog(`Built ${parsed.suggestedSuites?.length ?? 0} suites`, "success");
      await sleep(200);
      addLog("Discovery complete ✓", "success");

      setPlan(parsed); setPhase("done");
    } catch (e) {
      if (e.name === "AbortError") { addLog("Cancelled.", "system"); setPhase("idle"); }
      else { addLog(`Error: ${e.message}`, "error"); setPhase("error"); }
    }
  };

  const cancelDiscovery = () => { abortRef.current?.abort(); setPhase("idle"); };

  const generateScenarioForUC = async (uc) => {
    setSelectedUC(uc); setScenario(null); setSceLoading(true);
    try { setScenario(await generateScenario({ useCase: uc })); }
    catch { setScenario({ testCode: "// Error generating scenario", notes: "Try again." }); }
    setSceLoading(false);
  };

  const toggleSuite = id =>
    setSavedSuite(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filteredUCs = plan?.useCases?.filter(uc =>
    (filterPriority === "All" || uc.priority === filterPriority) &&
    (filterCategory === "All" || uc.category === filterCategory)
  ) ?? [];

  const categories = plan ? [...new Set(plan.useCases.map(u => u.category))] : [];

  return {
    url, setUrl,
    credentialId, credentialEntry, onCredentialChange,
    phase, log, logRef, plan, discover, cancelDiscovery,
    selectedUC, scenario, scenLoading, generateScenario: generateScenarioForUC,
    filterPriority, setFilterPriority, filterCategory, setFilterCategory,
    filteredUCs, categories, savedSuite, toggleSuite,
    activeTab, setActiveTab,
  };
}
