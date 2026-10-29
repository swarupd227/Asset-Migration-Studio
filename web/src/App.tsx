import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/lib/app';
import { Layout } from '@/shell/Layout';
import MissionControl from '@/pages/MissionControl';
import Connect from '@/pages/Connect';
import Discovery from '@/pages/Discovery';
import Alignment from '@/pages/Alignment';
import Hierarchy from '@/pages/Hierarchy';
import Review from '@/pages/Review';
import Validation from '@/pages/Validation';
import Quality from '@/pages/Quality';
import AiReady from '@/pages/AiReady';
import ProofPack from '@/pages/ProofPack';
import Audit from '@/pages/Audit';
import Ontology from '@/pages/Ontology';
import Memory from '@/pages/Memory';
import Agents from '@/pages/Agents';
import Projects from '@/pages/Projects';
import NewProject from '@/pages/NewProject';
import Decisions from '@/pages/Decisions';
import Skills from '@/pages/Skills';

export function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<MissionControl />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/new" element={<NewProject />} />
            <Route path="connect" element={<Connect />} />
            <Route path="discovery" element={<Discovery />} />
            <Route path="alignment" element={<Alignment />} />
            <Route path="hierarchy" element={<Hierarchy />} />
            <Route path="review" element={<Review />} />
            <Route path="decisions" element={<Decisions />} />
            <Route path="validation" element={<Validation />} />
            <Route path="quality" element={<Quality />} />
            <Route path="ai-ready" element={<AiReady />} />
            <Route path="proof" element={<ProofPack />} />
            <Route path="audit" element={<Audit />} />
            <Route path="ontology" element={<Ontology />} />
            <Route path="skills" element={<Skills />} />
            <Route path="memory" element={<Memory />} />
            <Route path="agents" element={<Agents />} />
            <Route path="*" element={<MissionControl />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
