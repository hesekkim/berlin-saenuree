import { useConfig } from '../../shared/context/ConfigContext';
import {
  applyPublicPageImageFallback,
  indexedPublicPageImageFallback,
  publicPageImageFallbacks,
  publicPageImageUrl,
} from '../../shared/content/publicPageImage';
import { useChurchHistoryContent } from './useChurchHistoryContent';
import { useChurchHistoryReveal } from './useChurchHistoryReveal';
import { useChurchHistoryBackground } from './useChurchHistoryBackground';
import { getChurchHistoryLabels } from './churchHistoryLabels';
import PageHeader from '../../shared/components/PageHeader/PageHeader';
import styles from './ChurchHistory.module.css';

export default function ChurchHistory() {
  const { language } = useConfig();
  const text = getChurchHistoryLabels(language);
  const { content, hasLoadError } = useChurchHistoryContent();
  const eventIds = content.events.map((event) => event.id);
  const { timelineRef, isRevealEnabled, revealedEvents, activeEventId } =
    useChurchHistoryReveal(eventIds);
  const activeEvent =
    content.events.find((event) => event.id === activeEventId) ??
    content.events[0];
  const activeEventIndex = activeEvent
    ? content.events.indexOf(activeEvent)
    : -1;
  const activeImageFallback =
    activeEventIndex >= 0
      ? indexedPublicPageImageFallback(
          publicPageImageFallbacks.churchHistoryEvent,
          activeEventIndex,
        )
      : undefined;
  const activeImage = activeEvent
    ? activeEvent.imageId
      ? publicPageImageUrl(activeEvent.imageId, 'display')
      : activeEvent.imageUrl
    : undefined;
  const { backgroundImage, transitionImage, finishTransition } =
    useChurchHistoryBackground(activeImage);

  return (
    <main className={styles.page}>
      <div
        className={styles.historyBackground}
        aria-hidden="true"
        style={
          backgroundImage
            ? {
                backgroundImage: backgroundImageStyle(
                  backgroundImage,
                  activeImageFallback,
                ),
              }
            : undefined
        }
      >
        {transitionImage ? (
          <div
            key={transitionImage}
            className={styles.historyBackgroundTransition}
            style={{
              backgroundImage: backgroundImageStyle(
                transitionImage,
                activeImageFallback,
              ),
            }}
            onAnimationEnd={finishTransition}
          />
        ) : null}
        <div className={styles.historyBackgroundShade} />
      </div>
      <div className={styles.headerContainer}>
        <PageHeader
          className={styles.header}
          headingClassName={styles.heading}
          title={text.tagline}
        />

        <div className={styles.introSurface}>
          {hasLoadError ? (
            <p className={styles.loadError} role="alert">
              {text.fallbackNotice}
            </p>
          ) : null}

          <section
            className={styles.introduction}
            aria-label={text.introductionLabel}
          >
            <div className={styles.introductionGrid}>
              {text.introduction.map(({ quotation, reference, explanation }) => (
                <article className={styles.introductionItem} key={quotation}>
                  <p className={styles.quotation}>{quotation}</p>
                  <p className={styles.reference}>{reference}</p>
                  <p className={styles.explanation}>{explanation}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
      <section
        className={styles.history}
        aria-labelledby="church-history-timeline"
      >
        <div className={styles.sectionHeading}>
          <h2 id="church-history-timeline">{text.timeline}</h2>
          <p>{text.timelineSubtitle}</p>
        </div>
        <ol
          className={`${styles.timeline} ${
            isRevealEnabled ? styles.timelineRevealReady : ''
          }`}
          ref={timelineRef}
        >
          {content.events.map((event, index) => {
            const image = event.imageId
              ? publicPageImageUrl(event.imageId, 'display')
              : event.imageUrl;
            return (
              <li
                className={`${styles.event} ${
                  revealedEvents.includes(event.id) ? styles.eventRevealed : ''
                }`}
                data-history-event={event.id}
                key={event.id}
              >
                <article className={styles.card}>
                  {image ? (
                    <img
                      className={styles.image}
                      src={image}
                      onError={(event) =>
                        applyPublicPageImageFallback(
                          event.currentTarget,
                          indexedPublicPageImageFallback(
                            publicPageImageFallbacks.churchHistoryEvent,
                            index,
                          ),
                        )
                      }
                      alt={event.date || `${text.timeline} ${index + 1}`}
                      loading={index > 1 ? 'lazy' : 'eager'}
                      decoding="async"
                    />
                  ) : null}
                  <div className={styles.eventContent}>
                    <time className={styles.date}>{event.date}</time>
                    {event.description ? <p>{event.description}</p> : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

function backgroundImageStyle(
  image: string,
  fallback: string | undefined,
): string {
  return [image, fallback]
    .filter((source): source is string => Boolean(source && source !== image))
    .map((source) => `url("${source}")`)
    .join(', ');
}
