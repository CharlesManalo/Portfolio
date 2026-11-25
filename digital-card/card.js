const shareButton = document.querySelector("#share-card");
const sharePanel = document.querySelector("#share-panel");
const cardUrl = document.querySelector("#card-url");
const copyButton = document.querySelector("#copy-link");
const copyStatus = document.querySelector("#copy-status");

const isHosted = /^(http:|https:)$/.test(location.protocol)
  && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

if (isHosted) {
  const shareUrl = new URL(location.href);
  shareUrl.hash = "";
  shareUrl.search = "";
  cardUrl.value = shareUrl.href;
  shareButton.hidden = false;
}

function setSharePanel(open) {
  sharePanel.hidden = !open;
  shareButton.setAttribute("aria-expanded", String(open));
  copyStatus.textContent = "";
  if (open) cardUrl.focus();
}

shareButton.addEventListener("click", async () => {
  if (!sharePanel.hidden) {
    setSharePanel(false);
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, url: cardUrl.value });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  setSharePanel(true);
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(cardUrl.value);
    copyStatus.textContent = "Card link copied.";
  } catch {
    cardUrl.focus();
    cardUrl.select();
    copyStatus.textContent = "Copy the selected link to share it.";
  }
});
