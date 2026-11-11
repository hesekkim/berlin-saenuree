import { useRef, useState, type PointerEvent } from 'react';
import {
  FiArrowUpRight,
  FiChevronLeft,
  FiChevronRight,
  FiMinus,
  FiPlus,
} from 'react-icons/fi';
import { getVisitLabels, formatVisitLabel } from './visitLabels';
import { isSafeGoogleMapsUrl } from '../../shared/content/visitContent';
import { useConfig } from '../../shared/context/ConfigContext';
import { useVisitContent } from './useVisitContent';
import mapSmall from './assets/map-small.webp';
import mapNormal from './assets/map-normal.webp';
import mapMedium from './assets/map-medium.webp';
import mapLarge from './assets/map-large.webp';
import church1 from './assets/church1.webp';
import church2 from './assets/church2.webp';
import church3 from './assets/church3.webp';
import church4 from './assets/church4.webp';
import PageHeader from '../../shared/components/PageHeader/PageHeader';
import styles from './Visit.module.css';

const mapImages = [mapSmall, mapNormal, mapMedium, mapLarge];
const venueImages = [church1, church2, church3, church4];

export default function Visit() {
  const { language } = useConfig();
  const labels = getVisitLabels(language);
  const { content, hasLoadError } = useVisitContent();
  const [mapZoom, setMapZoom] = useState(0);
  const [venueIndex, setVenueIndex] = useState(0);
  const [showSecondaryTransit, setShowSecondaryTransit] = useState(false);
  const carouselPointerX = useRef<number | null>(null);
  const mapUrl = isSafeGoogleMapsUrl(content.googleMapsUrl)
    ? content.googleMapsUrl
    : '';

  const setVenueSlide = (nextIndex: number) => {
    setVenueIndex(Math.max(0, Math.min(venueImages.length - 1, nextIndex)));
  };
  const handleCarouselPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) {
      return;
    }
    carouselPointerX.current = event.clientX;
  };
  const handleCarouselPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (carouselPointerX.current === null) {
      return;
    }
    const distance = event.clientX - carouselPointerX.current;
    if (Math.abs(distance) > 40) {
      setVenueSlide(venueIndex + (distance < 0 ? 1 : -1));
    }
    carouselPointerX.current = null;
  };

  return (
    <main className={styles.page}>
      <PageHeader
        className={styles.header}
        headingClassName={styles.heading}
        title={labels.heading}
      />

      {hasLoadError ? (
        <p className={styles.loadError} role="alert">
          {labels.contentUnavailable}
        </p>
      ) : null}

      <section className={styles.section} aria-labelledby="visit-schedule-title">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionNumber}>01</span>
          <h2 id="visit-schedule-title">{labels.scheduleTitle}</h2>
        </div>
        {content.services.length ? (
          <div className={styles.serviceGrid}>
            {content.services.map((service) => (
              <article className={styles.serviceCard} key={service.id}>
                <p className={styles.serviceName}>{service.name}</p>
                <p className={styles.serviceDay}>{service.day}</p>
                <p className={styles.serviceTime}>{service.time}</p>
                <div className={styles.serviceDivider} />
                <p className={styles.servicePlaceLabel}>{labels.placeLabel}</p>
                <p className={styles.servicePlace}>{service.place}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="visit-location-title">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionNumber}>02</span>
          <h2 id="visit-location-title">{labels.locationTitle}</h2>
        </div>

        <div className={styles.locationGrid}>
          <div className={styles.locationDetails}>
            <article className={styles.addressCard}>
              <p className={styles.cardEyebrow}>{labels.addressLabel}</p>
              <p className={styles.address}>{content.address}</p>
              {mapUrl ? (
                <a
                  className={styles.mapLink}
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {labels.openMaps}
                  <FiArrowUpRight aria-hidden />
                </a>
              ) : null}
            </article>

            {content.primaryTransit.length ? (
              <div className={styles.transitSection}>
                <h3>{labels.primaryTransitTitle}</h3>
                <div className={styles.transitGrid}>
                  {content.primaryTransit.map((route) => (
                    <article className={styles.transitCard} key={route.id}>
                      <span className={styles.transitType}>{route.type}</span>
                      <strong>{route.line}</strong>
                      <span>{route.station}</span>
                      <span className={styles.walkingTime}>{route.walkingTime}</span>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {content.secondaryTransit.length ? (
              <details
                className={styles.secondaryTransit}
                open={showSecondaryTransit}
                onToggle={(event) =>
                  setShowSecondaryTransit(event.currentTarget.open)
                }
              >
                <summary>
                  {showSecondaryTransit
                    ? labels.hideSecondaryTransit
                    : labels.showSecondaryTransit}
                </summary>
                <h3>{labels.secondaryTransitTitle}</h3>
                <ul>
                  {content.secondaryTransit.map((route) => (
                    <li key={route.id}>
                      <strong>{route.type} {route.line}</strong>
                      <span>{route.station}</span>
                      <span>{route.walkingTime}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          <div className={styles.mapColumn}>
            <div className={styles.mapFrame}>
              <img
                src={mapImages[mapZoom]}
                alt={labels.mapTitle}
                loading="lazy"
                decoding="async"
              />
              <div className={styles.mapControls}>
                <button
                  type="button"
                  aria-label={labels.zoomIn}
                  onClick={() =>
                    setMapZoom((current) =>
                      Math.min(mapImages.length - 1, current + 1),
                    )
                  }
                  disabled={mapZoom === mapImages.length - 1}
                >
                  <FiPlus aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={labels.zoomOut}
                  onClick={() => setMapZoom((current) => Math.max(0, current - 1))}
                  disabled={mapZoom === 0}
                >
                  <FiMinus aria-hidden />
                </button>
              </div>
            </div>
            <section className={styles.venue} aria-labelledby="visit-venue-title">
              <h3 id="visit-venue-title">{labels.venueTitle}</h3>
              <div
                className={styles.carousel}
                role="group"
                aria-roledescription="carousel"
                aria-label={labels.venueTitle}
                onPointerDown={handleCarouselPointerDown}
                onPointerUp={handleCarouselPointerUp}
              >
                {venueImages.map((image, index) => {
                  const position = index - venueIndex;
                  const slideClass =
                    position === 0
                      ? styles.carouselSlideActive
                      : position === -1
                        ? styles.carouselSlidePrevious
                        : position === 1
                          ? styles.carouselSlideNext
                          : position < 0
                            ? styles.carouselSlideHiddenPrevious
                            : styles.carouselSlideHiddenNext;

                  return (
                    <div
                      className={`${styles.carouselSlide} ${slideClass}`}
                      key={image}
                      aria-hidden={position !== 0}
                    >
                      {Math.abs(position) <= 1 ? (
                        <img
                          src={image}
                          alt={formatVisitLabel(labels.photoSlide, {
                            current: index + 1,
                            total: venueImages.length,
                          })}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className={`${styles.carouselArrow} ${styles.previous}`}
                  aria-label={labels.previousPhoto}
                  onClick={() => setVenueSlide(venueIndex - 1)}
                  disabled={venueIndex === 0}
                >
                  <FiChevronLeft aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${styles.carouselArrow} ${styles.next}`}
                  aria-label={labels.nextPhoto}
                  onClick={() => setVenueSlide(venueIndex + 1)}
                  disabled={venueIndex === venueImages.length - 1}
                >
                  <FiChevronRight aria-hidden />
                </button>
                <div className={styles.carouselPagination}>
                  {venueImages.map((_, index) => (
                    <button
                      type="button"
                      key={index}
                      aria-label={formatVisitLabel(labels.photoPicker, {
                        number: index + 1,
                      })}
                      aria-current={index === venueIndex ? 'true' : undefined}
                      className={
                        index === venueIndex ? styles.activeDot : undefined
                      }
                      onClick={() => setVenueSlide(index)}
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
