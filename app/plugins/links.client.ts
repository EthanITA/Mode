export default defineNuxtPlugin(() => {
  const links = useLinks();
  Monaco.openLinksWith((href) => {
    if (!links.owns(href)) return false;
    void links.open(href);
    return true;
  });
});
