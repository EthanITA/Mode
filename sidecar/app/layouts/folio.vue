<script lang="ts" setup></script>

<template>
  <div class="folio-desk">
    <header class="folio-rail">
      <slot name="rail">
        <p class="folio-empty">No session rail mounted yet.</p>
      </slot>
    </header>

    <div class="folio-spread">
      <article class="folio-page folio-page--left">
        <div class="folio-shelf">
          <slot name="shelf">
            <p class="folio-empty">No artifact shelf mounted yet.</p>
          </slot>
        </div>
        <slot name="artifact">
          <p class="folio-empty">No artifact mounted yet.</p>
        </slot>
      </article>

      <section class="folio-page folio-page--right">
        <slot name="threads">
          <p class="folio-empty">No threads mounted yet.</p>
        </slot>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Structural chrome only — mirrors .desk/.spread/.pg in
   ~/Notes/artifacts/sidecar-1c-folio.html. The pipeline island is fixed chrome
   mounted in app.vue, not a slot here — see app.vue for why. Tab and thread
   styling belongs to whoever fills the slot, not to this shell. */
.folio-desk {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--sunken);
  padding: 0 26px 24px;
}

.folio-rail {
  padding: 14px 20px 0;
  min-height: 44px;
}

.folio-spread {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-box);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.folio-page {
  min-width: 0;
  overflow-y: auto;
}

.folio-page--left {
  padding: 34px 40px 44px;
  border-right: 1px solid var(--border);
}

.folio-shelf {
  margin-bottom: 20px;
}

.folio-page--right {
  padding: 0 26px;
  background: var(--canvas);
  display: flex;
  flex-direction: column;
}

.folio-empty {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--subtle);
}

@media (max-width: 860px) {
  .folio-spread {
    grid-template-columns: 1fr;
  }
}
</style>
