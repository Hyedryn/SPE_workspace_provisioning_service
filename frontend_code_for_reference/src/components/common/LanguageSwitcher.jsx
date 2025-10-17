import PropTypes from 'prop-types'
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../i18n.js'

const LanguageSwitcher = ({ size, variant, sx, labelId }) => {
  const { i18n, t } = useTranslation()

  const currentLanguage = useMemo(() => {
    const resolved = i18n.resolvedLanguage ?? i18n.language ?? SUPPORTED_LANGUAGES[0]
    const normalized = resolved.split('-')[0]
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : SUPPORTED_LANGUAGES[0]
  }, [i18n.language, i18n.resolvedLanguage])

  const handleChange = (event) => {
    const nextLanguage = event.target.value
    if (nextLanguage && nextLanguage !== currentLanguage) {
      void i18n.changeLanguage(nextLanguage)
    }
  }

  const controlLabelId = labelId ?? 'language-switcher-label'

  return (
    <FormControl size={size} variant={variant} sx={sx}>
      <InputLabel id={controlLabelId}>{t('app.language')}</InputLabel>
      <Select
        labelId={controlLabelId}
        value={currentLanguage}
        label={t('app.language')}
        onChange={handleChange}
        sx={{ minWidth: 140 }}
      >
        {SUPPORTED_LANGUAGES.map((languageCode) => (
          <MenuItem key={languageCode} value={languageCode}>
            {t(`app.languageNames.${languageCode}`)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

LanguageSwitcher.propTypes = {
  labelId: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium']),
  variant: PropTypes.oneOf(['outlined', 'filled', 'standard']),
  sx: PropTypes.object,
}

LanguageSwitcher.defaultProps = {
  labelId: null,
  size: 'small',
  variant: 'outlined',
  sx: undefined,
}

export default LanguageSwitcher

