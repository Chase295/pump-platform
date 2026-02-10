import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Fullscreen as FullscreenIcon } from '@mui/icons-material';
import useFullscreenStore from '../../stores/useFullscreenStore';

interface FullscreenToggleProps {
  title: string;
}

const FullscreenToggle: React.FC<FullscreenToggleProps> = ({ title }) => {
  const enter = useFullscreenStore((s) => s.enter);

  return (
    <Tooltip title="Fullscreen">
      <IconButton
        onClick={() => enter(title)}
        size="small"
        sx={{
          color: 'rgba(255, 255, 255, 0.5)',
          '&:hover': { color: '#00d4ff' },
        }}
      >
        <FullscreenIcon />
      </IconButton>
    </Tooltip>
  );
};

export default FullscreenToggle;
