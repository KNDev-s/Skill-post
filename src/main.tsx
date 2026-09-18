import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CreatorPage } from './pages/CreatorPage';
import { createPostService } from './services';
import './styles.css';

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
