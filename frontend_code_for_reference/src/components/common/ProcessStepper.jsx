import PropTypes from 'prop-types'
import { Step, StepLabel, Stepper } from '@mui/material'

const ProcessStepper = ({ steps = [], activeStep = 0 }) => {
  if (!steps.length) return null

  return (
    <Stepper activeStep={activeStep} orientation="horizontal" alternativeLabel>
      {steps.map((step) => (
        <Step key={step}>
          <StepLabel>{step}</StepLabel>
        </Step>
      ))}
    </Stepper>
  )
}

ProcessStepper.propTypes = {
  steps: PropTypes.arrayOf(PropTypes.string),
  activeStep: PropTypes.number,
}

export default ProcessStepper
