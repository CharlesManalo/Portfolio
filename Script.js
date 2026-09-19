const {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
} = React;

// ─── LogoLoop Utilities & Hooks ─────────────────────────────
const ANIMATION_CONFIG = {
  SMOOTH_TAU: 0.25,
  MIN_COPIES: 2,
  COPY_HEADROOM: 2,
};

const toCssLength = (value) =>
  typeof value === "number" ? `${value}px` : (value ?? undefined);
const cx = (...parts) => parts.filter(Boolean).join(" ");

const useResizeObserver = (callback, elements, dependencies) => {
  useEffect(() => {
    if (!window.ResizeObserver) {
      const handleResize = () => callback();
      window.addEventListener("resize", handleResize);
      callback();
      return () => window.removeEventListener("resize", handleResize);
    }
    const observers = elements.map((ref) => {
      if (!ref.current) return null;
      const observer = new ResizeObserver(callback);
      observer.observe(ref.current);
      return observer;
    });
    callback();
    return () => {
      observers.forEach((observer) => observer?.disconnect());
    };
  }, [callback, elements, dependencies]);
};

const useImageLoader = (seqRef, onLoad, dependencies) => {
  useEffect(() => {
    const images = seqRef.current?.querySelectorAll("img") ?? [];
    if (images.length === 0) {
      onLoad();
      return;
    }
    let remainingImages = images.length;
    const handleImageLoad = () => {
      remainingImages -= 1;
      if (remainingImages === 0) onLoad();
    };
    images.forEach((img) => {
      if (img.complete) handleImageLoad();
      else {
        img.addEventListener("load", handleImageLoad, { once: true });
        img.addEventListener("error", handleImageLoad, { once: true });
      }
    });
    return () => {
      images.forEach((img) => {
        img.removeEventListener("load", handleImageLoad);
        img.removeEventListener("error", handleImageLoad);
      });
    };
  }, [onLoad, seqRef, dependencies]);
};

const useAnimationLoop = (
  trackRef,
  targetVelocity,
  seqWidth,
  seqHeight,
  isHovered,
  hoverSpeed,
  isVertical,
) => {
  const rafRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seqSize = isVertical ? seqHeight : seqWidth;
    if (seqSize > 0) {
      offsetRef.current = ((offsetRef.current % seqSize) + seqSize) % seqSize;
      track.style.transform = isVertical
        ? `translate3d(0, ${-offsetRef.current}px, 0)`
        : `translate3d(${-offsetRef.current}px, 0, 0)`;
    }

    if (prefersReduced) {
      track.style.transform = isVertical
        ? "translate3d(0, 0, 0)"
        : "translate3d(0, 0, 0)";
      return () => {
        lastTimestampRef.current = null;
      };
    }

    const animate = (timestamp) => {
      if (lastTimestampRef.current === null)
        lastTimestampRef.current = timestamp;
      const deltaTime =
        Math.max(0, timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;
      const target =
        isHovered && hoverSpeed !== undefined ? hoverSpeed : targetVelocity;
      const easingFactor =
        1 - Math.exp(-deltaTime / ANIMATION_CONFIG.SMOOTH_TAU);
      velocityRef.current += (target - velocityRef.current) * easingFactor;

      if (seqSize > 0) {
        let nextOffset = offsetRef.current + velocityRef.current * deltaTime;
        nextOffset = ((nextOffset % seqSize) + seqSize) % seqSize;
        offsetRef.current = nextOffset;
        track.style.transform = isVertical
          ? `translate3d(0, ${-offsetRef.current}px, 0)`
          : `translate3d(${-offsetRef.current}px, 0, 0)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
    };
  }, [
    targetVelocity,
    seqWidth,
    seqHeight,
    isHovered,
    hoverSpeed,
    isVertical,
    trackRef,
  ]);
};

const LogoLoop = memo(
  ({
    logos,
    speed = 120,
    direction = "left",
    width = "100%",
    logoHeight = 40,
    gap = 48,
    pauseOnHover,
    hoverSpeed,
    fadeOut = true,
    fadeOutColor,
    scaleOnHover = false,
    renderItem,
    ariaLabel = "Marquee logos",
    className,
    style,
  }) => {
    const containerRef = useRef(null);
    const trackRef = useRef(null);
    const seqRef = useRef(null);
    const [seqWidth, setSeqWidth] = useState(0);
    const [seqHeight, setSeqHeight] = useState(0);
    const [copyCount, setCopyCount] = useState(ANIMATION_CONFIG.MIN_COPIES);
    const [isHovered, setIsHovered] = useState(false);

    const effectiveHoverSpeed = useMemo(() => {
      if (hoverSpeed !== undefined) return hoverSpeed;
      if (pauseOnHover === true) return 0;
      if (pauseOnHover === false) return undefined;
      return 0;
    }, [hoverSpeed, pauseOnHover]);

    const isVertical = direction === "up" || direction === "down";
    const targetVelocity = useMemo(() => {
      const magnitude = Math.abs(speed);
      let directionMultiplier;
      if (isVertical) {
        directionMultiplier = direction === "up" ? 1 : -1;
      } else {
        directionMultiplier = direction === "left" ? 1 : -1;
      }
      const speedMultiplier = speed < 0 ? -1 : 1;
      return magnitude * directionMultiplier * speedMultiplier;
    }, [speed, direction, isVertical]);

    const updateDimensions = useCallback(() => {
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const sequenceRect = seqRef.current?.getBoundingClientRect?.();
      const sequenceWidth = sequenceRect?.width ?? 0;
      const sequenceHeight = sequenceRect?.height ?? 0;
      if (isVertical) {
        const parentHeight =
          containerRef.current?.parentElement?.clientHeight ?? 0;
        if (containerRef.current && parentHeight > 0) {
          const targetHeight = Math.ceil(parentHeight);
          if (containerRef.current.style.height !== `${targetHeight}px`)
            containerRef.current.style.height = `${targetHeight}px`;
        }
        if (sequenceHeight > 0) {
          setSeqHeight(Math.ceil(sequenceHeight));
          const viewport =
            containerRef.current?.clientHeight ??
            parentHeight ??
            sequenceHeight;
          const copiesNeeded =
            Math.ceil(viewport / sequenceHeight) +
            ANIMATION_CONFIG.COPY_HEADROOM;
          setCopyCount(Math.max(ANIMATION_CONFIG.MIN_COPIES, copiesNeeded));
        }
      } else if (sequenceWidth > 0) {
        setSeqWidth(Math.ceil(sequenceWidth));
        const copiesNeeded =
          Math.ceil(containerWidth / sequenceWidth) +
          ANIMATION_CONFIG.COPY_HEADROOM;
        setCopyCount(Math.max(ANIMATION_CONFIG.MIN_COPIES, copiesNeeded));
      }
    }, [isVertical]);

    useResizeObserver(
      updateDimensions,
      [containerRef, seqRef],
      [logos, gap, logoHeight, isVertical],
    );
    useImageLoader(seqRef, updateDimensions, [
      logos,
      gap,
      logoHeight,
      isVertical,
    ]);
    useAnimationLoop(
      trackRef,
      targetVelocity,
      seqWidth,
      seqHeight,
      isHovered,
      effectiveHoverSpeed,
      isVertical,
    );

    const cssVariables = useMemo(
      () => ({
        "--logoloop-gap": `${gap}px`,
        "--logoloop-logoHeight": `${logoHeight}px`,
        ...(fadeOutColor && { "--logoloop-fadeColor": fadeOutColor }),
      }),
      [gap, logoHeight, fadeOutColor],
    );

    const rootClasses = useMemo(
      () =>
        cx(
          "relative group overflow-hidden",
          isVertical ? "h-full inline-block" : "w-full",
          "[--logoloop-fadeColorAuto:#ffffff]",
          "dark:[--logoloop-fadeColorAuto:#0b0b0b]",
          className,
        ),
      [isVertical, className],
    );

    const handleMouseEnter = useCallback(() => {
      if (effectiveHoverSpeed !== undefined) setIsHovered(true);
    }, [effectiveHoverSpeed]);
    const handleMouseLeave = useCallback(() => {
      if (effectiveHoverSpeed !== undefined) setIsHovered(false);
    }, [effectiveHoverSpeed]);

    const renderLogoItem = useCallback(
      (item, key) => {
        const isNodeItem = "node" in item;
        const content = isNodeItem ? (
          <span
            className={cx(
              "inline-flex flex-col items-center justify-center space-y-2 px-8",
              "motion-reduce:transition-none",
              scaleOnHover &&
                "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/item:scale-120",
            )}
            aria-hidden={!!item.href && !item.ariaLabel}
          >
            {item.node}
            {item.label && (
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
                {item.label}
              </span>
            )}
          </span>
        ) : (
          <img
            className={cx(
              "h-[var(--logoloop-logoHeight)] w-auto block object-contain",
              "[-webkit-user-drag:none] pointer-events-none",
              "[image-rendering:-webkit-optimize-contrast]",
              "motion-reduce:transition-none",
              scaleOnHover &&
                "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/item:scale-120",
            )}
            src={item.src}
            alt={item.alt ?? ""}
            title={item.title}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        );

        return (
          <li
            className={cx(
              "flex-none flex items-center h-[120px]",
              isVertical
                ? "mb-[var(--logoloop-gap)]"
                : "mr-[var(--logoloop-gap)]",
            )}
            key={key}
            role="listitem"
          >
            {content}
          </li>
        );
      },
      [isVertical, scaleOnHover],
    );

    const logoLists = useMemo(
      () =>
        Array.from({ length: copyCount }, (_, copyIndex) => (
          <ul
            className={cx(
              "flex items-center min-w-max",
              isVertical && "flex-col",
            )}
            key={`copy-${copyIndex}`}
            role="list"
            aria-hidden={copyIndex > 0}
            ref={copyIndex === 0 ? seqRef : undefined}
          >
            {logos.map((item, itemIndex) =>
              renderLogoItem(item, `${copyIndex}-${itemIndex}`),
            )}
          </ul>
        )),
      [copyCount, logos, renderLogoItem, isVertical],
    );

    const containerStyle = useMemo(
      () => ({
        width: isVertical
          ? toCssLength(width) === "100%"
            ? undefined
            : toCssLength(width)
          : (toCssLength(width) ?? "100%"),
        ...cssVariables,
        ...style,
      }),
      [width, cssVariables, style, isVertical],
    );

    return (
      <div
        ref={containerRef}
        className={rootClasses}
        style={containerStyle}
        role="region"
        aria-label={ariaLabel}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {fadeOut && !isVertical && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[clamp(24px,10%,150px)] bg-gradient-to-r from-white to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[clamp(24px,10%,150px)] bg-gradient-to-l from-white to-transparent"
            />
          </>
        )}
        <div
          className={cx(
            "flex will-change-transform select-none relative z-0",
            "motion-reduce:transform-none",
            isVertical ? "flex-col h-max w-full" : "flex-row w-max",
          )}
          ref={trackRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {logoLists}
        </div>
      </div>
    );
  },
);

// ── Inline SVG icons ────────────────────────────────
const IconPhone = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path
      d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07A19.5 19.5 0 013.07
                   12.83 19.8 19.8 0 0 0 .92 4.18 2 2 0 0 1 2.92 2h3a2 2 0 0 1 2 1.72c.127.96.361
                   1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6.29 6.29l1.18-1.18a2 2
                   0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.28 17z"
    />
  </svg>
);

const IconMail = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 7 12 13 2 7" />
  </svg>
);

const IconUser = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const IconMapPin = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const IconGithub = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

const IconExternalLink = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
);

// ── Staggered Menu Component ────────────────────────────────
const StaggeredMenu = ({
  position = "right",
  colors = ["#B19EEF", "#5227FF"],
  items = [],
  socialItems = [],
  displaySocials = true,
  displayItemNumbering = true,
  className = "",
  logoUrl = "",
  logoText = "Austin",
  menuButtonColor = "#111",
  openMenuButtonColor = "#111",
  changeMenuColorOnOpen = true,
  isFixed = false,
  accentColor = "#f4803a",
  closeOnClickAway = true,
  onMenuOpen,
  onMenuClose,
}) => {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const panelRef = useRef(null);
  const preLayersRef = useRef(null);
  const preLayerElsRef = useRef([]);

  const plusHRef = useRef(null);
  const plusVRef = useRef(null);
  const iconRef = useRef(null);

  const textInnerRef = useRef(null);
  const textWrapRef = useRef(null);
  const [textLines, setTextLines] = useState(["Menu", "Close"]);

  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);
  const spinTweenRef = useRef(null);
  const textCycleAnimRef = useRef(null);
  const colorTweenRef = useRef(null);

  const toggleBtnRef = useRef(null);
  const busyRef = useRef(false);

  const itemEntranceTweenRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;

      const plusH = plusHRef.current;
      const plusV = plusVRef.current;
      const icon = iconRef.current;
      const textInner = textInnerRef.current;

      if (!panel || !plusH || !plusV || !icon || !textInner) return;

      let preLayers = [];
      if (preContainer) {
        preLayers = Array.from(preContainer.querySelectorAll(".sm-prelayer"));
      }
      preLayerElsRef.current = preLayers;

      const offscreen = position === "left" ? -100 : 100;
      gsap.set([panel, ...preLayers], { xPercent: offscreen });

      gsap.set(plusH, { transformOrigin: "50% 50%", rotate: 0 });
      gsap.set(plusV, { transformOrigin: "50% 50%", rotate: 90 });
      gsap.set(icon, { rotate: 0, transformOrigin: "50% 50%" });

      gsap.set(textInner, { yPercent: 0 });

      if (toggleBtnRef.current)
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
    });
    return () => ctx.revert();
  }, [menuButtonColor, position]);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;

    openTlRef.current?.kill();
    if (closeTweenRef.current) {
      closeTweenRef.current.kill();
      closeTweenRef.current = null;
    }
    itemEntranceTweenRef.current?.kill();

    const itemEls = Array.from(panel.querySelectorAll(".sm-panel-itemLabel"));
    const numberEls = Array.from(
      panel.querySelectorAll(".sm-panel-list[data-numbering] .sm-panel-item"),
    );
    const socialTitle = panel.querySelector(".sm-socials-title");
    const socialLinks = Array.from(panel.querySelectorAll(".sm-socials-link"));

    const layerStates = layers.map((el) => ({
      el,
      start: Number(gsap.getProperty(el, "xPercent")),
    }));
    const panelStart = Number(gsap.getProperty(panel, "xPercent"));

    if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
    if (numberEls.length) gsap.set(numberEls, { "--sm-num-opacity": 0 });
    if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
    if (socialLinks.length) gsap.set(socialLinks, { y: 25, opacity: 0 });

    const tl = gsap.timeline({ paused: true });

    layerStates.forEach((ls, i) => {
      tl.fromTo(
        ls.el,
        { xPercent: ls.start },
        { xPercent: 0, duration: 0.5, ease: "power4.out" },
        i * 0.07,
      );
    });

    const lastTime = layerStates.length ? (layerStates.length - 1) * 0.07 : 0;
    const panelInsertTime = lastTime + (layerStates.length ? 0.08 : 0);
    const panelDuration = 0.65;

    tl.fromTo(
      panel,
      { xPercent: panelStart },
      { xPercent: 0, duration: panelDuration, ease: "power4.out" },
      panelInsertTime,
    );

    if (itemEls.length) {
      const itemsStartRatio = 0.15;
      const itemsStart = panelInsertTime + panelDuration * itemsStartRatio;

      tl.to(
        itemEls,
        {
          yPercent: 0,
          rotate: 0,
          duration: 1,
          ease: "power4.out",
          stagger: { each: 0.1, from: "start" },
        },
        itemsStart,
      );

      if (numberEls.length) {
        tl.to(
          numberEls,
          {
            duration: 0.6,
            ease: "power2.out",
            "--sm-num-opacity": 1,
            stagger: { each: 0.08, from: "start" },
          },
          itemsStart + 0.1,
        );
      }
    }

    if (socialTitle || socialLinks.length) {
      const socialsStart = panelInsertTime + panelDuration * 0.4;

      if (socialTitle)
        tl.to(
          socialTitle,
          { opacity: 1, duration: 0.5, ease: "power2.out" },
          socialsStart,
        );
      if (socialLinks.length) {
        tl.to(
          socialLinks,
          {
            y: 0,
            opacity: 1,
            duration: 0.55,
            ease: "power3.out",
            stagger: { each: 0.08, from: "start" },
            onComplete: () => gsap.set(socialLinks, { clearProps: "opacity" }),
          },
          socialsStart + 0.04,
        );
      }
    }

    openTlRef.current = tl;
    return tl;
  }, []);

  const playOpen = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback("onComplete", () => {
        busyRef.current = false;
      });
      tl.play(0);
    } else {
      busyRef.current = false;
    }
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    itemEntranceTweenRef.current?.kill();

    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return;

    const all = [...layers, panel];
    closeTweenRef.current?.kill();

    const offscreen = position === "left" ? -100 : 100;

    closeTweenRef.current = gsap.to(all, {
      xPercent: offscreen,
      duration: 0.32,
      ease: "power3.in",
      overwrite: "auto",
      onComplete: () => {
        const itemEls = Array.from(
          panel.querySelectorAll(".sm-panel-itemLabel"),
        );
        if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });

        const numberEls = Array.from(
          panel.querySelectorAll(
            ".sm-panel-list[data-numbering] .sm-panel-item",
          ),
        );
        if (numberEls.length) gsap.set(numberEls, { "--sm-num-opacity": 0 });

        const socialTitle = panel.querySelector(".sm-socials-title");
        const socialLinks = Array.from(
          panel.querySelectorAll(".sm-socials-link"),
        );
        if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
        if (socialLinks.length) gsap.set(socialLinks, { y: 25, opacity: 0 });

        busyRef.current = false;
      },
    });
  }, [position]);

  const animateIcon = useCallback((opening) => {
    const icon = iconRef.current;
    const h = plusHRef.current;
    const v = plusVRef.current;
    if (!icon || !h || !v) return;

    spinTweenRef.current?.kill();

    if (opening) {
      gsap.set(icon, { rotate: 0, transformOrigin: "50% 50%" });
      spinTweenRef.current = gsap
        .timeline({ defaults: { ease: "power4.out" } })
        .to(h, { rotate: 45, duration: 0.5 }, 0)
        .to(v, { rotate: -45, duration: 0.5 }, 0);
    } else {
      spinTweenRef.current = gsap
        .timeline({ defaults: { ease: "power3.inOut" } })
        .to(h, { rotate: 0, duration: 0.35 }, 0)
        .to(v, { rotate: 90, duration: 0.35 }, 0)
        .to(icon, { rotate: 0, duration: 0.001 }, 0);
    }
  }, []);

  const animateColor = useCallback(
    (opening) => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      colorTweenRef.current?.kill();
      if (changeMenuColorOnOpen) {
        const targetColor = opening ? openMenuButtonColor : menuButtonColor;
        colorTweenRef.current = gsap.to(btn, {
          color: targetColor,
          delay: 0.18,
          duration: 0.3,
          ease: "power2.out",
        });
      } else {
        gsap.set(btn, { color: menuButtonColor });
      }
    },
    [openMenuButtonColor, menuButtonColor, changeMenuColorOnOpen],
  );

  useEffect(() => {
    if (toggleBtnRef.current) {
      if (changeMenuColorOnOpen) {
        const targetColor = openRef.current
          ? openMenuButtonColor
          : menuButtonColor;
        gsap.set(toggleBtnRef.current, { color: targetColor });
      } else {
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
      }
    }
  }, [changeMenuColorOnOpen, menuButtonColor, openMenuButtonColor]);

  const animateText = useCallback((opening) => {
    const inner = textInnerRef.current;
    if (!inner) return;

    textCycleAnimRef.current?.kill();

    const currentLabel = opening ? "Menu" : "Close";
    const targetLabel = opening ? "Close" : "Menu";
    const cycles = 3;

    const seq = [currentLabel];
    let last = currentLabel;
    for (let i = 0; i < cycles; i++) {
      last = last === "Menu" ? "Close" : "Menu";
      seq.push(last);
    }
    if (last !== targetLabel) seq.push(targetLabel);
    seq.push(targetLabel);

    setTextLines(seq);
    gsap.set(inner, { yPercent: 0 });

    const lineCount = seq.length;
    const finalShift = ((lineCount - 1) / lineCount) * 100;

    textCycleAnimRef.current = gsap.to(inner, {
      yPercent: -finalShift,
      duration: 0.5 + lineCount * 0.07,
      ease: "power4.out",
    });
  }, []);

  const toggleMenu = useCallback(() => {
    const target = !openRef.current;
    openRef.current = target;
    setOpen(target);

    if (target) {
      onMenuOpen?.();
      playOpen();
    } else {
      onMenuClose?.();
      playClose();
    }

    animateIcon(target);
    animateColor(target);
    animateText(target);
  }, [
    playOpen,
    playClose,
    animateIcon,
    animateColor,
    animateText,
    onMenuOpen,
    onMenuClose,
  ]);

  const closeMenu = useCallback(() => {
    if (openRef.current) {
      openRef.current = false;
      setOpen(false);
      onMenuClose?.();
      playClose();
      animateIcon(false);
      animateColor(false);
      animateText(false);
    }
  }, [playClose, animateIcon, animateColor, animateText, onMenuClose]);

  useEffect(() => {
    if (!closeOnClickAway || !open) return;

    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeOnClickAway, open, closeMenu]);

  return (
    <div
      className={`sm-scope z-[100] pointer-events-none ${isFixed ? "fixed top-0 left-0 w-screen h-screen overflow-hidden" : "w-full h-full"}`}
    >
      <div
        className={
          (className ? className + " " : "") +
          "staggered-menu-wrapper pointer-events-none relative w-full h-full"
        }
        style={accentColor ? { "--sm-accent": accentColor } : undefined}
        data-position={position}
        data-open={open || undefined}
      >
        <div
          ref={preLayersRef}
          className="sm-prelayers absolute top-0 right-0 bottom-0 pointer-events-none z-[5]"
          aria-hidden="true"
        >
          {(() => {
            const raw =
              colors && colors.length
                ? colors.slice(0, 4)
                : ["#1e1e22", "#35353c"];
            let arr = [...raw];
            if (arr.length >= 3) {
              const mid = Math.floor(arr.length / 2);
              arr.splice(mid, 1);
            }
            return arr.map((c, i) => (
              <div
                key={i}
                className="sm-prelayer absolute top-0 right-0 h-full w-full translate-x-0"
                style={{ background: c }}
              />
            ));
          })()}
        </div>

        <header
          className="staggered-menu-header absolute top-0 left-0 w-full flex items-center justify-between p-[2em] bg-transparent pointer-events-none z-20"
          aria-label="Main navigation header"
        >
          <div
            className="sm-logo flex items-center select-none pointer-events-auto"
            aria-label="Logo"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="sm-logo-img block h-8 w-auto object-contain"
                draggable={false}
                width={110}
                height={24}
              />
            ) : (
              <span className="logo" style={{ color: "#111" }}>
                {logoText}
              </span>
            )}
          </div>

          <button
            ref={toggleBtnRef}
            className="sm-toggle relative inline-flex items-center gap-[0.3rem] bg-transparent border-0 cursor-pointer text-[#111] font-medium leading-none overflow-visible pointer-events-auto"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="staggered-menu-panel"
            onClick={toggleMenu}
            type="button"
          >
            <span
              ref={textWrapRef}
              className="sm-toggle-textWrap relative inline-block h-[1em] overflow-hidden whitespace-nowrap w-[var(--sm-toggle-width,auto)] min-w-[var(--sm-toggle-width,auto)]"
              aria-hidden="true"
            >
              <span
                ref={textInnerRef}
                className="sm-toggle-textInner flex flex-col leading-none"
              >
                {textLines.map((l, i) => (
                  <span
                    className="sm-toggle-line block h-[1em] leading-none"
                    key={i}
                  >
                    {l}
                  </span>
                ))}
              </span>
            </span>

            <span
              ref={iconRef}
              className="sm-icon relative w-[14px] h-[14px] shrink-0 inline-flex items-center justify-center [will-change:transform]"
              aria-hidden="true"
            >
              <span
                ref={plusHRef}
                className="sm-icon-line absolute left-1/2 top-1/2 w-full h-[2px] bg-current rounded-[2px] -translate-x-1/2 -translate-y-1/2 [will-change:transform]"
              />
              <span
                ref={plusVRef}
                className="sm-icon-line sm-icon-line-v absolute left-1/2 top-1/2 w-full h-[2px] bg-current rounded-[2px] -translate-x-1/2 -translate-y-1/2 [will-change:transform]"
              />
            </span>
          </button>
        </header>

        <aside
          id="staggered-menu-panel"
          ref={panelRef}
          className="staggered-menu-panel absolute top-0 right-0 h-full bg-white flex flex-col p-[6em_2em_2em_2em] overflow-y-auto z-10 backdrop-blur-[12px] pointer-events-auto"
          style={{ WebkitBackdropFilter: "blur(12px)" }}
          aria-hidden={!open}
        >
          <div className="sm-panel-inner flex-1 flex flex-col gap-5">
            <ul
              className="sm-panel-list list-none m-0 p-0 flex flex-col gap-2"
              role="list"
              data-numbering={displayItemNumbering || undefined}
            >
              {items && items.length ? (
                items.map((it, idx) => (
                  <li
                    className="sm-panel-itemWrap relative overflow-hidden leading-none"
                    key={it.label + idx}
                  >
                    <a
                      className="sm-panel-item relative text-black font-semibold text-[4rem] cursor-pointer leading-none tracking-[-2px] uppercase transition-[background,color] duration-150 ease-linear inline-block no-underline pr-[1.4em]"
                      href={it.link}
                      aria-label={it.ariaLabel}
                      data-index={idx + 1}
                      onClick={() => {
                        closeMenu();
                        if (it.onClick) it.onClick();
                      }}
                    >
                      <span className="sm-panel-itemLabel inline-block [transform-origin:50%_100%] will-change-transform">
                        {it.label}
                      </span>
                    </a>
                  </li>
                ))
              ) : (
                <li
                  className="sm-panel-itemWrap relative overflow-hidden leading-none"
                  aria-hidden="true"
                >
                  <span className="sm-panel-item relative text-black font-semibold text-[4rem] cursor-pointer leading-none tracking-[-2px] uppercase transition-[background,color] duration-150 ease-linear inline-block no-underline pr-[1.4em]">
                    <span className="sm-panel-itemLabel inline-block [transform-origin:50%_100%] will-change-transform">
                      No items
                    </span>
                  </span>
                </li>
              )}
            </ul>

            {displaySocials && socialItems && socialItems.length > 0 && (
              <div
                className="sm-socials mt-auto pt-8 flex flex-col gap-3"
                aria-label="Social links"
              >
                <h3 className="sm-socials-title m-0 text-base font-medium [color:var(--sm-accent,#ff0000)]">
                  Socials
                </h3>
                <ul
                  className="sm-socials-list list-none m-0 p-0 flex flex-row items-center gap-4 flex-wrap"
                  role="list"
                >
                  {socialItems.map((s, i) => (
                    <li key={s.label + i} className="sm-socials-item">
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sm-socials-link text-[1.2rem] font-medium text-[#111] no-underline relative inline-block py-[2px] transition-[color,opacity] duration-300 ease-linear"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

// ── Dots grid ───────────────────────────────────────
const DotsGrid = () => {
  const dots = Array.from({ length: 48 });
  return (
    <div className="dots-grid">
      {dots.map((_, i) => (
        <div key={i} className="dot" />
      ))}
    </div>
  );
};

// ── Social pill (sidebar) ───────────────────────────
const SocialPill = ({ label, href = "#" }) => (
  <a
    href={href}
    className="social-pill"
    aria-label={label}
    title={label}
    style={{ fontFamily: "serif", fontStyle: "italic" }}
  >
    {label.slice(0, 2)}
  </a>
);

// ── Main App ────────────────────────────────────────
const GitHubCalendar = ({ src, profile }) => {
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setStatus("loading");
    const timer = setTimeout(() => setStatus(current => current === "loading" ? "error" : current), 15000);
    return () => clearTimeout(timer);
  }, [src, attempt]);
  return (
    <div className="github-calendar" aria-busy={status === "loading"}>
      <p role="status" className="calendar-status">
        {status === "loading" ? "Loading contributions..." : status === "error" ? "Contributions are unavailable right now." : ""}
      </p>
      {status === "error" && <button type="button" className="calendar-retry" onClick={() => setAttempt(value => value + 1)}>Retry</button>}
      <div className="calendar-scroll" tabIndex={0} role="region" aria-label="Daily GitHub contributions">
        <a href={profile} target="_blank" rel="noopener noreferrer">
          <img key={`${src}-${attempt}`} src={`${src}?reload=${attempt}`} alt="Daily GitHub contributions over the past year" width="900" height="150"
            style={{ display: status === "ready" ? "block" : "none" }}
            onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
        </a>
      </div>
    </div>
  );
};

const App = () => {
  const githubProfile = "https://github.com/CharlesManalo";
  const githubCalendar = "https://ghchart.rshah.org/CharlesManalo";
  const [activeNav, setActiveNav] = useState("HOME");
  const navLinks = ["HOME", "ABOUT", "SERVICES", "WORKS", "CONTACT"];

  const menuItems = useMemo(
    () =>
      navLinks.map((link) => ({
        label: link,
        link: `#${link}`,
        ariaLabel: `Go to ${link} section`,
        onClick: () => {
          document.getElementById(link)?.scrollIntoView({ behavior: "smooth" });
        },
      })),
    [navLinks],
  );

  const socialItems = [
    { label: "Github", link: githubProfile },
  ];

  useEffect(() => {
    const mainElement = document.querySelector(".main");
    const options = {
      root: mainElement,
      rootMargin: "0px",
      threshold: 0.5,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveNav(entry.target.id);
        }
      });
    }, options);

    navLinks.forEach((link) => {
      const el = document.getElementById(link);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // ── Data: Marquees ──────────────────────────────────
  const techLogos = useMemo(
    () => [
      {
        node: <i className="devicon-react-original colored text-6xl"></i>,
        label: "React",
      },
      {
        node: <i className="devicon-vitejs-plain colored text-6xl"></i>,
        label: "Vite",
      },
      {
        node: <i className="devicon-typescript-plain colored text-6xl"></i>,
        label: "TypeScript",
      },
      {
        node: <i className="devicon-tailwindcss-original colored text-6xl"></i>,
        label: "Tailwind",
      },
      {
        node: <i className="devicon-nodejs-plain colored text-6xl"></i>,
        label: "Node.js",
      },
      {
        node: <i className="devicon-express-original colored text-6xl"></i>,
        label: "Express",
      },
      {
        node: <i className="devicon-postgresql-plain colored text-6xl"></i>,
        label: "PostgreSQL",
      },
      {
        node: <i className="devicon-git-plain colored text-6xl"></i>,
        label: "Git",
      },
      {
        node: (
          <i className="devicon-github-original text-6xl text-gray-900"></i>
        ),
        label: "GitHub",
      },
      {
        node: <i className="devicon-html5-plain colored text-6xl"></i>,
        label: "HTML5",
      },
      {
        node: <i className="devicon-css3-plain colored text-6xl"></i>,
        label: "CSS3",
      },
      {
        node: <i className="devicon-java-plain colored text-6xl"></i>,
        label: "Java",
      },
      {
        node: <i className="devicon-javascript-plain colored text-6xl"></i>,
        label: "JavaScript",
      },
      {
        node: <i className="devicon-mysql-plain colored text-6xl"></i>,
        label: "MySQL",
      },
      {
        node: <i className="devicon-php-plain colored text-6xl"></i>,
        label: "PHP",
      },
      {
        node: (
          <i className="devicon-dot-net-plain-wordmark colored text-6xl"></i>
        ),
        label: ".Net",
      },
      {
        node: <i className="devicon-python-plain colored text-6xl"></i>,
        label: "Python",
      },
    ],
    [],
  );

  const toolLogos = useMemo(
    () => [
      {
        node: (
          <span className="text-4xl font-black tracking-tighter text-gray-800">
            Anti Gravity
          </span>
        ),
        label: "Agent",
      },
      {
        node: (
          <span className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-600">
            WindSurf
          </span>
        ),
        label: "IDE",
      },
      {
        node: (
          <i className="devicon-vercel-original text-5xl text-gray-900"></i>
        ),
        label: "Vercel",
      },
      {
        node: <i className="devicon-supabase-plain colored text-5xl"></i>,
        label: "Supabase",
      },
      {
        node: (
          <span className="text-4xl font-black text-[#46E3B7] tracking-tight">
            Render
          </span>
        ),
        label: "Hosting",
      },
      {
        node: (
          <span className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-green-600">
            ChatGPT
          </span>
        ),
        label: "AI",
      },
      {
        node: (
          <span className="text-4xl font-serif text-[#D97757] font-bold italic">
            Claude
          </span>
        ),
        label: "Assistance",
      },
      {
        node: (
          <span className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8E2DE2] to-[#4A00E0]">
            Gemini
          </span>
        ),
        label: "AI",
      },
    ],
    [],
  );

  const scrollToSection = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <StaggeredMenu
        isFixed={true}
        items={menuItems}
        socialItems={socialItems}
        logoText="Austin"
        accentColor="#f4803a"
        colors={["#f4803a", "#e8547a", "#7c3aed"]}
      />
      {/* ─ Sidebar ─────────────────────────────────── */}
      <aside className="sidebar">
        <div className="logo">Austin</div>

        <nav>
          {navLinks.map((link) => (
            <a
              key={link}
              href={`#${link}`}
              className={`nav-link ${activeNav === link ? "active" : ""}`}
              onClick={(e) => scrollToSection(e, link)}
            >
              {link}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <p className="copyright">
            Copyright &copy;2026 Charles Austin Manalo. All rights reserved.
          </p>
        </div>
      </aside>

      {/* ─ Main area ───────────────────────────────── */}
      <main className="main">
        {/* === HOME SECTION === */}
        <section id="HOME" className="view-section">
          {/* Decorative shapes */}
          <div className="shapes-wrap">
            <div className="shape-circle-purple" />
            <div className="shape-arc-red" />
            <div className="shape-peach" />
            <div className="shape-triangle-orange" />
            <div className="shape-triangle-pink" />
            <DotsGrid />
            <span className="star" style={{ top: "5%", right: "20%" }}>
              ✦
            </span>
            <span className="star" style={{ bottom: "24%", left: "3%" }}>
              ✦
            </span>
          </div>

          {/* Portrait over shapes */}
          <div className="portrait-wrap">
            <img
              src="portrait.png"
              alt="Charles Austin Manalo"
              className="portrait-img"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>

          {/* Hero text */}
          <div className="hero-content">
            <h1 className="headline">
              <span className="light">MY </span>NAME
              <br />
              IS <strong>CHARLES</strong>
              <br />
              <strong>MANALO...</strong>
            </h1>

            <p className="subline">
              <strong>A Web Developer and Programmer</strong> based in{" "}
              <em>Philippines</em>
            </p>

            <a href="mailto:charlesaustinmanalo@gmail.com" className="cta-btn">
              Let's talk with me
              <span className="cta-icon">✉</span>
            </a>

            <div className="contact-row">
              <div className="contact-item">
                <div className="contact-icon-wrap">
                  <IconPhone />
                </div>
                +63 9386073374
              </div>
              <div className="contact-item">
                <div className="contact-icon-wrap">
                  <IconMail />
                </div>
                charlesaustinmanalo@gmail.com
              </div>
            </div>
          </div>
        </section>

        {/* === ABOUT SECTION === */}
        <section
          id="ABOUT"
          className="view-section flex items-center justify-center"
          style={{ paddingLeft: "60px", paddingRight: "120px" }}
        >
          <div className="max-w-4xl w-full text-center">
            <h3 className="text-3xl font-serif text-gray-900 mb-12 font-bold tracking-tight">
              Welcome and Feel free
              <br />
              to read about myself
            </h3>

            {/* Contact Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12 mb-12 max-w-2xl mx-auto">
              <div className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                  <IconPhone />
                </div>
                <span className="font-bold text-gray-800 text-sm italic">
                  +63 9386073374
                </span>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                  <IconUser />
                </div>
                <span className="font-bold text-gray-800 text-sm italic">
                  18 years old
                </span>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                  <IconMail />
                </div>
                <span className="font-bold text-gray-800 text-sm italic">
                  charlesaustinmanalo@gmail.com
                </span>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                  <IconMapPin />
                </div>
                <span className="font-bold text-gray-800 text-sm italic">
                  Philippines, Oriental Mindoro, Calapan City
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-gray-200 mb-12"></div>

            {/* Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16 max-w-4xl mx-auto">
              <div className="text-center">
                <h4 className="flex items-center justify-center gap-4 text-lg font-bold font-serif text-gray-900 leading-tight mb-4 tracking-tight">
                  <span className="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-orange-400">
                    2
                  </span>
                  <span className="italic leading-snug">
                    Year's
                    <br />
                    Studying...
                  </span>
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed font-light">
                  Hello there! My name is{" "}
                  <strong className="font-medium text-purple-400">
                    Charles Austin Manalo
                  </strong>
                  . I was a 2024-2026 ICT student, now a web developer,
                  Freelancer & programmer, and I'm very passionate and dedicated
                  to my work.
                </p>
              </div>

              <div className="text-center">
                <h4 className="flex items-center justify-center gap-4 text-lg font-bold font-serif text-gray-900 leading-tight mb-4 tracking-tight">
                  <span className="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                    4
                  </span>
                  <span className="italic leading-snug">
                    Projects
                    <br />
                    Completed...
                  </span>
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed font-light">
                  With 4 major projects completed while studying, I have
                  acquired the skills and knowledge necessary to make your
                  project a success.
                </p>
              </div>
            </div>

            {/* School Background */}
            <div className="mb-16">
              <h4 className="text-2xl font-serif text-gray-900 mb-8 font-bold tracking-tight text-center">
                Education Background
              </h4>
              <div className="bg-gray-50 rounded-lg p-8 max-w-2xl mx-auto">
                <div className="text-center">
                  <h5 className="text-lg font-bold text-gray-800 mb-2">
                    Oriental Mindoro National High School
                  </h5>
                  <p className="text-sm text-gray-600 mb-4">
                    <span className="italic">2025-2026</span>
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Completed my secondary education with focus on Information
                    and Communications Technology (ICT), developing foundational
                    skills in web development and programming.
                  </p>
                  <div className="mt-6 border-t border-gray-200 pt-5">
                    <h5 className="text-lg font-bold text-gray-800 mb-2">
                      Mindoro State University (MinSu)
                    </h5>
                    <p className="text-sm text-gray-600 mb-3">
                      First-year student · Bachelor of Science in Information Technology (BSIT)
                    </p>
                    <p className="text-sm text-gray-600">18 years old</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Blockquote */}
            <div
              className="bg-[#181818] text-white p-10 flex items-center gap-8 relative overflow-hidden"
              style={{ minHeight: "160px" }}
            >
              <div
                className="text-[#333] opacity-40 absolute -top-8 -left-4 font-serif"
                style={{ fontSize: "180px", lineHeight: "1" }}
              >
                "
              </div>
              <div className="relative z-10 w-full ml-6">
                <p className="italic text-base text-gray-300 font-serif leading-relaxed">
                  "Age and Experience are just numbers, but passion and
                  dedication are what drive me to success."
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Other sections as placeholders */}
        {/* === SERVICES SECTION === */}
        <section
          id="SERVICES"
          className="view-section flex flex-col justify-center items-center py-24 bg-gray-50 bg-opacity-30 relative overflow-hidden"
          style={{ paddingLeft: "60px", paddingRight: "80px" }}
        >
          <div className="w-full max-w-6xl mx-auto flex flex-col items-center mb-16">
            <h3 className="text-3xl font-serif text-gray-900 font-bold tracking-tight mb-4 text-center">
              Skills & Technologies
            </h3>
            <p className="text-center text-gray-500 max-w-2xl mb-12">
              I leverage modern technologies, tools, and AI assistants to build
              scalable, high-performance web applications efficiently.
            </p>

            {/* Tech Stack Marquee */}
            <div className="w-full bg-white bg-opacity-70 p-8 rounded-3xl shadow-sm border border-gray-100 mb-10 overflow-hidden relative">
              <h4 className="text-sm font-bold text-gray-400 tracking-widest uppercase mb-8 ml-8">
                Tech Stack
              </h4>
              <LogoLoop
                logos={techLogos}
                speed={40}
                direction="left"
                gap={40}
                logoHeight={60}
                pauseOnHover={true}
              />
            </div>

            {/* Tools Marquee */}
            <div className="w-full bg-white bg-opacity-70 p-8 rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative">
              <h4 className="text-sm font-bold text-gray-400 tracking-widest uppercase mb-8 ml-8 text-right">
                Tools & Assistants
              </h4>
              <LogoLoop
                logos={toolLogos}
                speed={40}
                direction="right"
                gap={40}
                logoHeight={60}
                pauseOnHover={true}
              />
            </div>

            {/* Services Grid */}
            <div className="mt-16">
              <h4 className="text-2xl font-serif text-gray-900 mb-12 font-bold tracking-tight text-center">
                My Skills
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
                {/* Web Application Development */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-orange-400 to-pink-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    Web Applications
                  </h5>
                </div>

                {/* Website Design & Development */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    Custom Systems
                  </h5>
                </div>

                {/* POS Systems */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" />
                      <line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" />
                      <line x1="15" y1="20" x2="15" y2="23" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    POS Systems
                  </h5>
                </div>

                {/* Landing Pages */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-blue-400 to-green-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    Landing Pages
                  </h5>
                </div>

                {/* Web & Database Systems */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-green-400 to-yellow-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    Database Systems
                  </h5>
                </div>

                {/* UI/UX Design */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-yellow-400 to-red-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    UI/UX Design
                  </h5>
                </div>

                {/* Security for Websites */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-teal-400 to-blue-600 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    Website Security
                  </h5>
                </div>

                {/* And More */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-red-400 to-indigo-500 rounded-full flex items-center justify-center">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </div>
                  <h5 className="font-semibold text-gray-800 text-sm">
                    And More
                  </h5>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="WORKS" className="view-section px-6 md:px-16 py-24 flex flex-col justify-center bg-white z-10 w-full relative">
          <div className="max-w-6xl w-full mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Selected Works</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Featured Card */}
              <div className="lg:col-span-2 group rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col transition hover:border-gray-300">
                <div className="aspect-[16/10] bg-gray-200 w-full overflow-hidden relative">
                  <img src="images/Examzz.png" alt="Examzz Screenshot" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]" />
                </div>
                <div className="p-6 md:p-8 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Examzz</h3>
                      <p className="text-sm text-gray-500 mt-1">Online Examination and Assessment Platform</p>
                    </div>
                    <div className="flex gap-2">
                       <a href={githubProfile} target="_blank" rel="noopener noreferrer" className="p-2 border border-gray-200 rounded-md hover:bg-gray-100 transition text-gray-700" title="GitHub profile">
                          <IconGithub />
                       </a>
                       <a href="https://examzz.vercel.app/" target="_blank" rel="noopener noreferrer" className="p-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition" title="Live Site">
                          <IconExternalLink />
                       </a>
                    </div>
                  </div>
                  <p className="text-gray-600 mt-auto text-sm md:text-base leading-relaxed">
                    An intuitive online examination platform enabling seamless test creation, automated grading, and comprehensive assessment management.
                  </p>
                </div>
              </div>

              {/* Two smaller cards */}
              <div className="flex flex-col gap-6">
                
                {/* Card 2 */}
                <div className="flex-1 group rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col transition hover:border-gray-300">
                  <div className="aspect-video bg-gray-200 w-full overflow-hidden relative">
                    <img src="images/AksyonAgad.png" alt="ActionAgad Screenshot" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-gray-900">ActionAgad</h3>
                      <div className="flex gap-2">
                         <a href={githubProfile} target="_blank" rel="noopener noreferrer" className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 transition text-gray-700" title="GitHub profile">
                            <IconGithub />
                         </a>
                         <a href="https://communitysafev3.onrender.com/" target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition" title="Live Site">
                            <IconExternalLink />
                         </a>
                       </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">CommunitySafe infrastructure hazard reporting platform.</p>
                  </div>
                </div>

                {/* Card 3 */}
                <div className="flex-1 group rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col transition hover:border-gray-300">
                  <div className="aspect-video bg-gray-200 w-full overflow-hidden relative">
                    <img src="images/OMNHS.png" alt="OMNHS Website Screenshot" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="text-lg font-bold text-gray-900">OMNHS Website</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">An informational school portal providing announcements and resources.</p>
                  </div>
                </div>

              </div>

            </div>

            <div className="mt-10 border-t border-gray-200 pt-8">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">GitHub activity</h3>
                  <p className="text-sm text-gray-500 mt-1">Daily contributions over the past year</p>
                </div>
                <a href={githubProfile} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-700 hover:text-black inline-flex items-center gap-2">
                  <IconGithub />
                  View GitHub profile
                </a>
              </div>
              <GitHubCalendar src={githubCalendar} profile={githubProfile} />
            </div>
          </div>
        </section>
        <section id="CONTACT" className="view-section px-16">
          <div className="contact-content">
            <h2 className="text-3xl text-gray-900 font-bold">Let's work together</h2>
            <p className="text-gray-600 my-5">Have a project in mind? Tell me what you're building.</p>
            <a className="cta-btn" href="mailto:charlesaustinmanalo@gmail.com"><IconMail /> Email Charles</a>
            <a className="contact-phone" href="tel:+639386073374">+63 938 607 3374</a>
            <p className="text-sm text-gray-500 mt-6">Calapan City, Oriental Mindoro, Philippines</p>
          </div>
        </section>

        {/* Right strip */}
        <div className="right-strip">
          <a href="#" className="strip-icon" title="Instagram">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <circle cx="12" cy="12" r="5" />
              <circle
                cx="17.5"
                cy="6.5"
                r="1"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </a>
          <a href="#" className="strip-icon" title="Dribbble">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path
                d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94
                             5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"
              />
            </svg>
          </a>
          <a href="#" className="strip-icon" title="Twitter">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0
                             013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0
                             00-.08-.83A7.72 7.72 0 0023 3z"
              />
            </svg>
          </a>
          <div className="strip-divider" />
        </div>
      </main>
    </>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
