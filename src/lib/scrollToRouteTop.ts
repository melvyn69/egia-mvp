const scrollToRouteTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  document
    .querySelectorAll<HTMLElement>("[data-route-scroll-container]")
    .forEach((container) => {
      container.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
};

export { scrollToRouteTop };
