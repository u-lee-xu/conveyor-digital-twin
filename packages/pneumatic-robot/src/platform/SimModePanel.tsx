import { useState } from 'react';
import { SimPanel } from '../scenes/pneumatic-robot/panels/SimPanel';
import { HelpPanel } from '../scenes/pneumatic-robot/panels/HelpPanel';

export function SimModePanel() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <SimPanel onShowHelp={() => setShowHelp(true)} />
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
    </>
  );
}
