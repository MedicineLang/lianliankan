import { type FC, useEffect, useState } from 'react';

const App: FC = () => {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const src = hash === '#admin' ? '/game.html#admin' : '/game.html';

  return (
    <div className="w-full h-full max-w-full max-h-full overflow-hidden bg-[#2f6b3a]">
      <iframe
        key={src}
        src={src}
        title="村庄连连看 · 转盘抽奖"
        className="block w-full h-full border-0"
        allow="autoplay"
      />
    </div>
  );
};

export default App;
