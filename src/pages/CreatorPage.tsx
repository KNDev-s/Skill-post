import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  Feather,
  FlaskConical,
  Image,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Brand } from '../components/Brand';
import { SlidePreview } from '../components/SlidePreview';
import { Workflow } from '../components/Workflow';
import { config } from '../config/env';
import { usePost } from '../hooks/usePost';
import type { PostService } from '../services/post-service';
import {
  generatePostSchema,
  objectives,
  statusLabels,
  tones,
  type GeneratePostRequest,
  type Slide,
} from '../types/post';

const emptySlide: Slide = {
  id: 'empty',
  title: 'Sua próxima boa ideia começa aqui.',
  body: 'Dê um tema. Encontre as palavras. Crie novas conexões.',
  layout: 'cover',
};
const briefInitial: GeneratePostRequest = {
  topic: '',
  slideCount: 5,
  tone: 'educativo',
  objective: 'autoridade',
};

export function CreatorPage({ service }: { service: PostService }) {
  const { post, busy, error, working, run, refresh } = usePost(service);
  const [brief, setBrief] = useState(briefInitial);
  const [formError, setFormError] = useState('');
  const [selected, setSelected] = useState(0);
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const demo = config.mode === 'mock';
  const editable = post && ['ready', 'approved'].includes(post.status);
  const dirty = Boolean(post && caption !== post.caption);
  const captionValid = caption.trim().length > 0 && caption.length <= 2200;
  const activeSlide = post?.slides[selected] ?? post?.slides[0];
  const generating =
    busy === 'Gerando conteúdo' || busy?.startsWith('Regenerando') || post?.status === 'generating';
  const canPublish = post?.status === 'approved' && !dirty && !working;
  const finished = post?.status === 'published' || post?.status === 'scheduled';

  useEffect(() => {
    setCaption(post?.caption ?? '');
    setCopied(false);
  }, [post?.caption, post?.id]);
  useEffect(() => {
    setSelected(0);
  }, [post?.id]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    const parsed = generatePostSchema.safeParse(brief);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    setFormError('');
    const result = await run('Gerando conteúdo', () => service.generatePost(parsed.data));
    if (result) {
      setSelected(0);
      setScheduleAt('');
      setScheduleError('');
    }
  }
  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Não foi possível copiar automaticamente. Selecione e copie a legenda.');
    }
  }
  async function publish() {
    if (!post || !canPublish) return;
    setScheduleError('');
    if (publishMode === 'now')
      await run('Publicando', () => service.publishPost(post.id, { revision: post.revision }));
    else {
      const date = new Date(scheduleAt);
      if (!scheduleAt || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
        setScheduleError('Escolha uma data e horário no futuro.');
        return;
      }
      await run('Agendando', () =>
        service.schedulePost(post.id, {
          revision: post.revision,
          scheduledAt: date.toISOString(),
          timeZone,
        }),
      );
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          WORKSPACE <span>INTERNO</span>
        </div>
        <nav aria-label="Navegação principal">
          <a className="nav-item current" href="#create">
            <WandSparkles size={18} /> Criar conteúdo <span className="nav-dot" />
          </a>
          <a className="nav-item" href="#preview">
            <Layers3 size={18} /> Preview do carrossel
          </a>
          <a className="nav-item" href="#publish">
            <Send size={17} /> Publicação
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Sparkles size={19} />
          </span>
          <h3>Da ideia ao próximo post.</h3>
          <p>Um espaço para criar com intenção e publicar com confiança.</p>
          <span>
            FEITO PELA KNDEV'S <ArrowUpRight size={13} />
          </span>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">KN</span>
          <div>
            <strong>Equipe KNDev's</strong>
            <small>Social Studio · V1</small>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>Social Studio</strong>
          </div>
          <div className={`environment ${demo ? 'demo' : ''}`}>
            <span />
            {demo ? 'Modo demonstração' : 'Modo integrado'}
          </div>
          <span className="top-avatar">KN</span>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> SEU ESTÚDIO DE CONTEÚDO
              </div>
              <h1>
                Boas ideias merecem <span>um bom post.</span>
              </h1>
              <p>Transforme um tema em um carrossel. Revise, aprove e compartilhe.</p>
            </div>
            <span className="format-badge">
              <Layers3 size={17} /> Carrossel · 4:5
            </span>
          </div>
          {demo && (
            <div className="demo-banner">
              <FlaskConical size={16} />
              <span>
                Um espaço para experimentar. Geração, publicação e agendamento são simulados nesta
                demonstração.
              </span>
              <span className="demo-label">DEMO</span>
            </div>
          )}
          <Workflow status={post?.status} generating={Boolean(generating)} />
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              {post && (
                <button
                  type="button"
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() => void refresh()}
                >
                  Atualizar status
                </button>
              )}
            </div>
          )}
          {post?.status === 'failed' && (
            <div className="error-banner" role="alert">
              {post.failure || 'A geração falhou. Tente regenerar o conteúdo ou criar outro post.'}
            </div>
          )}
          <div className="editor-grid">
            <section className="panel brief-panel" id="create" aria-labelledby="brief-heading">
              <div className="panel-heading">
                <span className="panel-icon">
                  <Feather size={18} />
                </span>
                <div>
                  <h2 id="brief-heading">O que vamos criar?</h2>
                  <p>O primeiro passo é uma boa direção.</p>
                </div>
                <span className="section-number">01</span>
              </div>
              <form onSubmit={(event) => void generate(event)}>
                <fieldset disabled={working}>
                  <label htmlFor="topic">
                    Tema do carrossel <span className="required-dot">*</span>
                  </label>
                  <textarea
                    id="topic"
                    name="topic"
                    className="topic-input"
                    placeholder="Ex.: Como a automação pode simplificar a rotina de pequenos negócios"
                    value={brief.topic}
                    maxLength={300}
                    aria-invalid={Boolean(formError)}
                    aria-describedby={formError ? 'topic-error' : 'topic-hint'}
                    onChange={(e) => {
                      setBrief({ ...brief, topic: e.target.value });
                      setFormError('');
                    }}
                  />
                  <div className="field-meta">
                    <span id="topic-hint">Qual ideia você quer compartilhar?</span>
                    <span>{brief.topic.length}/300</span>
                  </div>
                  {formError && (
                    <p id="topic-error" className="field-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="inspiration">
                    <Sparkles size={13} />
                    <span>Precisa de um começo?</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBrief({
                          ...brief,
                          topic: 'Como a automação transforma pequenos negócios',
                        })
                      }
                    >
                      Usar exemplo <ArrowUpRight size={12} />
                    </button>
                  </div>
                  <div className="field-group">
                    <span className="field-label" id="count-label">
                      Tamanho do carrossel
                    </span>
                    <div className="segmented counts" role="group" aria-labelledby="count-label">
                      {([3, 5, 7, 10] as const).map((count) => (
                        <button
                          type="button"
                          key={count}
                          aria-pressed={brief.slideCount === count}
                          onClick={() => setBrief({ ...brief, slideCount: count })}
                        >
                          <strong>{count}</strong>
                          <span>slides</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <label htmlFor="tone">Tom de voz</label>
                    <select
                      id="tone"
                      value={brief.tone}
                      onChange={(e) =>
                        setBrief({ ...brief, tone: e.target.value as GeneratePostRequest['tone'] })
                      }
                    >
                      {Object.entries(tones).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="objective">Objetivo</label>
                    <select
                      id="objective"
                      value={brief.objective}
                      onChange={(e) =>
                        setBrief({
                          ...brief,
                          objective: e.target.value as GeneratePostRequest['objective'],
                        })
                      }
                    >
                      {Object.entries(objectives).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="brand-card">
                    <span className="brand-mini">
                      K<span>n</span>
                    </span>
                    <div>
                      <strong>Identidade KNDev's</strong>
                      <small>Visual provisório · aguardando assets</small>
                    </div>
                    <CircleHelp size={15} aria-hidden="true" />
                  </div>
                  <button className="button primary generate-button" type="submit">
                    {generating ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    {generating ? 'Gerando conteúdo...' : 'Gerar conteúdo'}
                    {!generating && <ArrowRight size={17} />}
                  </button>
                  <p className="generate-hint">
                    {post
                      ? 'Gerar cria um novo post com este briefing.'
                      : 'Sua ideia ganha forma no próximo passo.'}
                  </p>
                </fieldset>
              </form>
              <div className="brief-footnote">
                <CheckCheck size={16} />
                <span>Você revisa e aprova antes de publicar.</span>
              </div>
            </section>
            <div className="result-column">
              <section
                className="panel preview-panel"
                id="preview"
                aria-labelledby="preview-heading"
                aria-busy={Boolean(generating)}
              >
                <div className="panel-heading">
                  <span className="panel-icon">
                    <Layers3 size={18} />
                  </span>
                  <div>
                    <h2 id="preview-heading">Preview do carrossel</h2>
                    <p>
                      {post
                        ? `${post.brief.slideCount} slides · ${tones[post.brief.tone]} · ${objectives[post.brief.objective]}`
                        : 'Uma prévia do que vem por aí.'}
                    </p>
                  </div>
                  <span
                    className={`status-badge ${generating ? 'generating' : post?.status || 'draft'}`}
                    role="status"
                  >
                    {generating ? 'Gerando' : post ? statusLabels[post.status] : 'Aguardando ideia'}
                  </span>
                </div>
                <div className={`preview-stage ${!post ? 'empty-stage' : ''}`}>
                  <div className="stage-label">
                    <Image size={12} />{' '}
                    {activeSlide?.imageUrl
                      ? 'IMAGEM DO BACKEND'
                      : post
                        ? 'PREVIEW DO CONTEÚDO'
                        : 'SEU PRÓXIMO CARROSSEL'}
                  </div>
                  <div className="preview-art-wrapper">
                    <SlidePreview
                      key={activeSlide?.id || 'empty'}
                      slide={activeSlide || emptySlide}
                      index={activeSlide ? selected : 0}
                      total={post?.brief.slideCount || brief.slideCount}
                    />
                  </div>
                  <span className="dimension-label">1080 × 1350 px</span>
                  {generating && (
                    <div className="generation-overlay" role="status">
                      <span className="generation-orb">
                        <Sparkles size={28} />
                      </span>
                      <strong>Dando forma à sua ideia...</strong>
                      <span>Preparando seu conteúdo para revisão.</span>
                      <div className="loading-bar" />
                    </div>
                  )}
                </div>
                {post?.slides.length ? (
                  <div className="slides-bar">
                    <button
                      className="icon-button"
                      aria-label="Slide anterior"
                      disabled={selected === 0 || working}
                      onClick={() => setSelected((i) => i - 1)}
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="slide-tabs" aria-label="Selecionar slide">
                      {post.slides.map((slide, i) => (
                        <button
                          className={selected === i ? 'selected' : ''}
                          key={slide.id}
                          type="button"
                          aria-label={`Ver slide ${i + 1}`}
                          aria-pressed={selected === i}
                          disabled={working}
                          onClick={() => setSelected(i)}
                        >
                          <SlidePreview
                            slide={slide}
                            index={i}
                            total={post.slides.length}
                            miniature
                          />
                          <span>{String(i + 1).padStart(2, '0')}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Próximo slide"
                      disabled={selected === post.slides.length - 1 || working}
                      onClick={() => setSelected((i) => i + 1)}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="empty-preview-caption">
                    <span className="small-dot" /> Layout ilustrativo. Seu conteúdo aparecerá aqui.
                  </div>
                )}
                <div className="preview-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={
                      !post ||
                      !['ready', 'approved', 'failed'].includes(post.status) ||
                      working ||
                      dirty
                    }
                    onClick={() =>
                      post &&
                      void run('Regenerando conteúdo', () =>
                        service.regeneratePost(post.id, { revision: post.revision }),
                      )
                    }
                  >
                    <RefreshCw size={15} /> Regenerar tudo
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!editable || !activeSlide || working || dirty}
                    onClick={() =>
                      post &&
                      activeSlide &&
                      void run('Regenerando slide', () =>
                        service.regenerateSlide(post.id, activeSlide.id, {
                          revision: post.revision,
                        }),
                      )
                    }
                  >
                    Regenerar slide {selected + 1}
                    <RefreshCw size={13} />
                  </button>
                  <span className="preview-count">
                    {post?.slides.length ? `${selected + 1} / ${post.slides.length}` : 'PRÉVIA'}
                  </span>
                </div>
                {activeSlide && (
                  <details className="slide-transcript" key={activeSlide.id}>
                    <summary>Ler texto completo do slide {selected + 1}</summary>
                    <h3>{activeSlide.title}</h3>
                    <p>{activeSlide.body}</p>
                  </details>
                )}
              </section>
              <div className="details-grid">
                <section className="panel caption-panel" aria-labelledby="caption-heading">
                  <div className="panel-heading">
                    <span className="panel-icon">
                      <Feather size={17} />
                    </span>
                    <h2 id="caption-heading">Legenda</h2>
                    <button
                      type="button"
                      className="icon-button copy-button"
                      disabled={!caption}
                      onClick={() => void copyCaption()}
                      aria-label={copied ? 'Legenda copiada' : 'Copiar legenda'}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <textarea
                    aria-label="Legenda do post"
                    placeholder="As palavras que acompanham sua ideia aparecem aqui depois da geração."
                    value={caption}
                    maxLength={2200}
                    disabled={!editable || working}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                  <div className="caption-footer">
                    <span>{caption.length.toLocaleString('pt-BR')} / 2.200</span>
                    {dirty ? (
                      <button
                        className="text-button"
                        disabled={working || !captionValid}
                        onClick={() =>
                          post &&
                          void run('Salvando legenda', () =>
                            service.updateCaption(post.id, { revision: post.revision, caption }),
                          )
                        }
                      >
                        Salvar legenda
                      </button>
                    ) : (
                      <span>{post ? 'Salva no post' : 'Pronta para sua mensagem'}</span>
                    )}
                  </div>
                  {dirty && <p className="inline-hint">Salve a legenda e aprove a nova versão.</p>}
                  {copyError && (
                    <p className="field-error" role="alert">
                      {copyError}
                    </p>
                  )}
                  <span className="sr-only" role="status">
                    {copied ? 'Legenda copiada.' : ''}
                  </span>
                </section>
                <section
                  className="panel publish-panel"
                  id="publish"
                  aria-labelledby="publish-heading"
                >
                  <div className="panel-heading">
                    <span className="panel-icon">
                      <Send size={17} />
                    </span>
                    <h2 id="publish-heading">Próximo passo</h2>
                    <span className="section-number">02</span>
                  </div>
                  {finished ? (
                    <div className="success-state" role="status">
                      <span>
                        <CheckCheck size={23} />
                      </span>
                      <h3>{post.status === 'scheduled' ? 'Tudo agendado!' : 'Post publicado!'}</h3>
                      <p>
                        {demo
                          ? 'Simulação concluída. Nenhum post foi enviado ao Instagram.'
                          : post.status === 'scheduled'
                            ? 'Seu conteúdo está na fila de publicação.'
                            : 'Seu conteúdo foi publicado.'}
                      </p>
                      {post.scheduledAt && (
                        <small>
                          {new Date(post.scheduledAt).toLocaleString('pt-BR', {
                            timeZone: post.timeZone,
                          })}{' '}
                          · {post.timeZone}
                        </small>
                      )}
                      <button
                        className="text-button"
                        disabled={working}
                        onClick={() => void refresh()}
                      >
                        Atualizar status <RefreshCw size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="publish-help">
                        Gostou do resultado? Aprove o conteúdo para liberar a publicação.
                      </p>
                      <button
                        className={`button approval ${post?.status === 'approved' ? 'is-approved' : ''}`}
                        disabled={post?.status !== 'ready' || working || dirty}
                        onClick={() =>
                          post &&
                          void run('Aprovando', () =>
                            service.approvePost(post.id, { revision: post.revision }),
                          )
                        }
                      >
                        <Check size={16} />
                        {post?.status === 'approved' ? 'Conteúdo aprovado' : 'Aprovar conteúdo'}
                      </button>
                      <fieldset className="publish-options" disabled={!canPublish}>
                        <legend className="sr-only">Quando publicar</legend>
                        <label>
                          <input
                            type="radio"
                            name="publishMode"
                            checked={publishMode === 'now'}
                            onChange={() => {
                              setPublishMode('now');
                              setScheduleError('');
                            }}
                          />
                          <Send size={14} />
                          Publicar agora
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="publishMode"
                            checked={publishMode === 'schedule'}
                            onChange={() => setPublishMode('schedule')}
                          />
                          <CalendarDays size={14} />
                          Agendar
                        </label>
                      </fieldset>
                      {publishMode === 'schedule' && (
                        <div className="schedule-fields">
                          <label htmlFor="schedule">Data e horário</label>
                          <input
                            id="schedule"
                            type="datetime-local"
                            value={scheduleAt}
                            disabled={!canPublish}
                            onChange={(e) => {
                              setScheduleAt(e.target.value);
                              setScheduleError('');
                            }}
                          />
                          <small>Fuso: {timeZone}</small>
                        </div>
                      )}
                      {scheduleError && (
                        <p className="field-error" role="alert">
                          {scheduleError}
                        </p>
                      )}
                      <button
                        className="button publish-button"
                        disabled={!canPublish}
                        onClick={() => void publish()}
                      >
                        {publishMode === 'now' ? <Send size={15} /> : <CalendarDays size={15} />}
                        {publishMode === 'now' ? 'Publicar agora' : 'Agendar publicação'}
                        <ArrowUpRight size={16} />
                      </button>
                      <p className="publish-disclaimer">
                        {demo
                          ? 'Ações simuladas no modo demonstração.'
                          : 'Publicação processada pelo backend.'}
                      </p>
                    </>
                  )}
                </section>
              </div>
            </div>
          </div>
          <footer className="page-footer">
            <span>
              <span className="footer-dot" /> Criatividade humana. Tecnologia a favor.
            </span>
            <span>
              KNDev's Social Studio <span className="footer-version">v0.1</span>
            </span>
          </footer>
          {busy && !generating && (
            <div className="busy-toast" role="status">
              <LoaderCircle className="spin" size={16} /> {busy}...
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
