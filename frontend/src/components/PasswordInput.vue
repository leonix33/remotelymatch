<script setup>
import { ref } from 'vue';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  minlength: { type: [Number, String], default: undefined },
  autocomplete: { type: String, default: 'new-password' },
  inputClass: { type: String, default: 'input' },
});

const emit = defineEmits(['update:modelValue']);

const visible = ref(false);
</script>

<template>
  <div class="password-input-wrap">
    <input
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :class="inputClass"
      :placeholder="placeholder"
      :required="required"
      :minlength="minlength"
      :autocomplete="autocomplete"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <button
      type="button"
      class="password-input-toggle"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :title="visible ? 'Hide password' : 'Show password'"
      @click="visible = !visible"
    >
      <svg
        v-if="!visible"
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <svg
        v-else
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        aria-hidden="true"
      >
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42" />
        <path d="M9.88 5.1A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.2 17.2 0 0 1-3.17 4.25" />
        <path d="M6.12 6.12A17.2 17.2 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 5.12-1.28" />
      </svg>
    </button>
  </div>
</template>
