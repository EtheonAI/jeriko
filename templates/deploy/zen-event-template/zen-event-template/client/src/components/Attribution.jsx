import React from 'react'

/**
 * Attribution component for The Noun Project icons
 * Use this component to provide proper attribution for free icons from The Noun Project
 */
const Attribution = ({ iconName, creatorName, className = "" }) => {
  return (
    <div className={`text-xs text-gray-500 font-satoshi ${className}`}>
      <span>
        {iconName} by {creatorName} from{" "}
        <a 
          href="https://thenounproject.com/browse/icons/term/sparkle/" 
          target="_blank" 
          rel="noopener noreferrer"
          title="sparkle Icons"
          className="hover:text-gray-700 underline"
        >
          Noun Project
        </a>
        {" "}(CC BY 3.0)
      </span>
    </div>
  )
}

export default Attribution