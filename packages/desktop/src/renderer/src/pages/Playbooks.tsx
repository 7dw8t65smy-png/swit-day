import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api';
import type { PlaybookWithSteps, Project, Playbook } from '@swit/shared';
import { PlaybookList } from './playbooks/PlaybookList';
import { PlaybooksOverview } from './playbooks/PlaybooksOverview';
import { PlaybookDetail } from './playbooks/PlaybookDetail';
import { CreatePlaybookModal } from './playbooks/CreatePlaybookModal';

// Playbooks ≡ regulations/SOPs. Read-only reference: title, optional docs,
// numbered list of steps. No execution, no runs, no history — the user fills
// these in for memory ("how do I do X again?"), nothing else.

export default function Playbooks(): JSX.Element {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<PlaybookWithSteps | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const [pbs, ps] = await Promise.all([api.listPlaybooks(), api.listProjects()]);
    setPlaybooks(pbs);
    setProjects(ps);
    if (selected) {
      const fresh = await api.getPlaybook(selected.id).catch(() => null);
      setSelected(fresh);
    }
  }

  async function selectPb(id: string): Promise<void> {
    const pb = await api.getPlaybook(id);
    setSelected(pb);
  }

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects]
  );

  return (
    <div className="p-6 grid grid-cols-[320px_1fr] gap-5 max-w-[1400px]">
      <aside>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold">Регламенты</h1>
            <div className="text-[11px] text-muted mt-0.5">
              Справочник правил и инструкций
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="bg-accent text-white w-8 h-8 rounded-md hover:bg-accent-hover flex items-center justify-center shadow-sm"
            title="Новый регламент"
          >
            <Plus size={16} />
          </button>
        </div>

        <PlaybookList
          playbooks={playbooks}
          projects={projectById}
          selectedId={selected?.id ?? null}
          onSelect={selectPb}
        />
      </aside>

      <main className="min-w-0">
        {selected ? (
          <PlaybookDetail playbook={selected} projects={projects} onChanged={reload} />
        ) : (
          <PlaybooksOverview
            playbooks={playbooks}
            projects={projects}
            onSelect={selectPb}
            onCreate={() => setCreating(true)}
          />
        )}
      </main>

      <CreatePlaybookModal
        open={creating}
        projects={projects}
        onClose={() => setCreating(false)}
        onCreated={async (pb) => {
          setCreating(false);
          await reload();
          await selectPb(pb.id);
        }}
      />
    </div>
  );
}
