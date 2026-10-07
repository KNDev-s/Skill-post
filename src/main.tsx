import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CreatorPage } from './pages/CreatorPage';
import { createPostService } from './services';
import './styles.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';

const root = createRoot(document.getElementById('root')!);
createPostService()
  .then((service) =>
    root.render(
      <StrictMode>
        <CreatorPage service={service} />
      </StrictMode>,
    ),
  )
  .catch(() => {
    root.render(
      <main>
        <h1>Não foi possível iniciar o estúdio.</h1>
        <p>Verifique as variáveis de ambiente e recarregue a página.</p>
      </main>,
    );
  });
