#!/usr/bin/env bash
# Sourced by the reviewed CI build. Both modes are synthetic, never production.
case "${GIFT_ANDROID_MODE:-offline}" in
  offline) export VITE_API_ORIGIN='' VITE_PUBLIC_ORIGIN='' VITE_PRIVACY_POLICY_URL='' VITE_SUPPORT_URL='' ;;
  online)
    export VITE_API_ORIGIN='https://gift-lists-demo.vercel.app'
    export VITE_PUBLIC_ORIGIN='https://gift-lists-demo.vercel.app'
    export VITE_PRIVACY_POLICY_URL='https://gift-lists-demo.vercel.app/privacy'
    export VITE_SUPPORT_URL='https://gift-lists-demo.vercel.app/support'
    ;;
  *) echo 'Unreviewed Android mode: refusing build' >&2; return 1 ;;
esac
export VITE_DEMO='true' VITE_SUPPORT_CONTACT='' VITE_OPERATOR_NAME='' VITE_LEGAL_APPROVED='false'
